import { redisClient } from "@repo/redis";

const CACHE_PREFIX = "dashboard:";

/** Keys examined per SCAN round-trip. Larger batches mean fewer round-trips. */
const SCAN_BATCH = 250;

interface CacheStats {
  hits: number;
  misses: number;
}

const stats: CacheStats = { hits: 0, misses: 0 };

export const getCacheStats = (): CacheStats => ({ ...stats });

export const getOrSetCache = async <T>(
  key: string,
  compute: () => Promise<T>,
  ttlSeconds: number,
): Promise<T> => {
  const fullKey = `${CACHE_PREFIX}${key}`;

  const cached = await redisClient.get(fullKey);
  if (cached !== null) {
    console.debug(`[cache] HIT key=${key}`);
    stats.hits++;
    return JSON.parse(cached) as T;
  }

  console.debug(`[cache] MISS key=${key}`);
  stats.misses++;
  const result = await compute();

  await redisClient.setex(fullKey, ttlSeconds, JSON.stringify(result));

  return result;
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
