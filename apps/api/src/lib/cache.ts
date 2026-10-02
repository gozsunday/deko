import { redisClient } from "@repo/redis";

// v2: values are envelopes carrying a compute timestamp
const CACHE_PREFIX = "dashboard:v2:";

/** Keys examined per SCAN round-trip. Larger batches mean fewer round-trips. */
const SCAN_BATCH = 250;

/** How long a refresh lock is held before another request may take over. */
const LOCK_MS = 5_000;

/** How long a cold-key loser waits for the winner's value before computing itself. */
const COLD_WAIT_MS = 1_000;
const COLD_POLL_MS = 50;

interface CacheStats {
  hits: number;
  stale: number;
  misses: number;
  refreshes: number;
}

const stats: CacheStats = { hits: 0, stale: 0, misses: 0, refreshes: 0 };

export const getCacheStats = (): CacheStats => ({ ...stats });

/** Extra spread over the TTL so replicas don't all refresh in the same second. */
function jittered(ttlSeconds: number): number {
  return ttlSeconds + Math.floor(Math.random() * ttlSeconds * 0.1);
}

type Envelope<T> = { value: T; computedAt: number };

function parseEnvelope<T>(raw: string): Envelope<T> | null {
  try {
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (typeof parsed?.computedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * SET NX returns null when someone else holds the lock, so only one request
 * per key computes at a time across every replica.
 */
async function acquireLock(lockKey: string): Promise<boolean> {
  const result = await redisClient.set(
    lockKey,
    "1",
    "NX",
    "PX",
    String(LOCK_MS),
  );
  return result !== null;
}

async function store<T>(
  fullKey: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  const envelope: Envelope<T> = { value, computedAt: Date.now() };
  await redisClient.setex(
    fullKey,
    jittered(ttlSeconds),
    JSON.stringify(envelope),
  );
}

async function computeAndStore<T>(
  fullKey: string,
  compute: () => Promise<T>,
  ttlSeconds: number,
): Promise<T> {
  const lockKey = `${fullKey}:lock`;

  if (await acquireLock(lockKey)) {
    try {
      const value = await compute();
      await store(fullKey, value, ttlSeconds);
      return value;
    } finally {
      await redisClient.del(lockKey);
    }
  }

  // Someone else is computing. Prefer their result over duplicating the work,
  // but don't wait forever -- if they crashed the lock expires and we take over.
  /* oxlint-disable no-await-in-loop -- this polls until a deadline; the reads are
     sequential by nature and running them together would defeat the wait. */
  const deadline = Date.now() + COLD_WAIT_MS;
  while (Date.now() < deadline) {
    await Bun.sleep(COLD_POLL_MS);
    const cached = await redisClient.get(fullKey);
    const envelope = cached === null ? null : parseEnvelope<T>(cached);
    if (envelope) return envelope.value;
  }
  /* oxlint-enable no-await-in-loop */

  const value = await compute();
  await store(fullKey, value, ttlSeconds);
  return value;
}

/**
 * Refreshes off the request path: the caller already has a usable value, so
 * this must never throw or block anyone.
 */
async function refreshInBackground<T>(
  fullKey: string,
  compute: () => Promise<T>,
  ttlSeconds: number,
): Promise<void> {
  const lockKey = `${fullKey}:lock`;

  try {
    if (!(await acquireLock(lockKey))) return;

    try {
      stats.refreshes++;
      const value = await compute();
      await store(fullKey, value, ttlSeconds);
    } finally {
      await redisClient.del(lockKey);
    }
  } catch (error) {
    console.error(`[cache] background refresh failed key=${fullKey}`, error);
  }
}

export interface CacheOptions {
  /** How long Redis keeps the value. Must exceed softSeconds. */
  ttlSeconds: number;
  /**
   * Oldest value still served without recomputing. Past this the caller gets
   * the stale value immediately and a refresh runs behind it, so staleness is
   * capped here rather than by the TTL.
   */
  softSeconds: number;
}

export const getOrSetCache = async <T>(
  key: string,
  compute: () => Promise<T>,
  { ttlSeconds, softSeconds }: CacheOptions,
): Promise<T> => {
  const fullKey = `${CACHE_PREFIX}${key}`;
  const cached = await redisClient.get(fullKey);
  const envelope = cached === null ? null : parseEnvelope<T>(cached);

  if (envelope) {
    const ageSeconds = (Date.now() - envelope.computedAt) / 1000;

    if (ageSeconds <= softSeconds) {
      console.debug(`[cache] HIT key=${key} age=${Math.round(ageSeconds)}s`);
      stats.hits++;
      return envelope.value;
    }

    console.debug(`[cache] STALE key=${key} age=${Math.round(ageSeconds)}s`);
    stats.stale++;
    void refreshInBackground(fullKey, compute, ttlSeconds);
    return envelope.value;
  }

  console.debug(`[cache] MISS key=${key}`);
  stats.misses++;
  return computeAndStore(fullKey, compute, ttlSeconds);
};

/* oxlint-disable no-await-in-loop -- SCAN hands back the cursor for the next
   round, so the iterations are sequential by protocol. Running them in parallel
   would skip keys and duplicate work. */
export const invalidateCache = async (pattern: string): Promise<number> => {
  const fullPattern = `${CACHE_PREFIX}${pattern}`;
  let cursor = "0";
  let deleted = 0;

  // SCAN, not KEYS. KEYS is O(N) over the whole keyspace and blocks the single
  // Redis thread for the duration, so one invalidation stalls every other client
  // of the cache -- including the reads this app depends on.
  do {
    const [next, batch] = await redisClient.scan(
      cursor,
      "MATCH",
      fullPattern,
      "COUNT",
      SCAN_BATCH,
    );
    cursor = next;

    if (batch.length > 0) {
      // UNLINK frees the value on a background thread rather than inline
      await redisClient.unlink(...batch);
      deleted += batch.length;
    }
  } while (cursor !== "0");

  return deleted;
};
/* oxlint-enable no-await-in-loop */
