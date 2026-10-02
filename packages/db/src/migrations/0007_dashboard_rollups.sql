-- Rollups for the overview KPIs and the status/level breakdowns.
--
-- Both aggregate over the whole retention window on every request today, so
-- their cost tracks ingest rate. These pre-aggregate at 15-minute buckets:
--   duration histogram  ~10x fewer rows than log_event
--   status/level counts ~150x fewer
--
-- Percentiles stay exact. duration has only ~846 distinct values, so
-- (bucket, duration) -> count is a complete histogram of the window; summing
-- it across buckets reconstructs the multiset PERCENTILE_CONT would have seen.
-- The trade is that windows snap to 15-minute boundaries.

DROP MATERIALIZED VIEW IF EXISTS log_hourly_stats CASCADE;--> statement-breakpoint

-- duration histogram: serves p50/p95/p99 and avg duration
CREATE MATERIALIZED VIEW service_duration_histogram
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
  time_bucket(INTERVAL '15 minutes', timestamp) AS bucket,
  service_id,
  environment,
  duration,
  COUNT(*)::int AS n,
  SUM(duration)::bigint AS duration_sum
FROM log_event
GROUP BY 1, 2, 3, 4
WITH NO DATA;--> statement-breakpoint

-- status and level counts: serves error count/rate and both breakdowns
CREATE MATERIALIZED VIEW service_status_counts
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
  time_bucket(INTERVAL '15 minutes', timestamp) AS bucket,
  service_id,
  environment,
  status,
  level,
  COUNT(*)::int AS n
FROM log_event
GROUP BY 1, 2, 3, 4, 5
WITH NO DATA;--> statement-breakpoint

-- materialized_only = false merges the in-progress bucket from raw at query
-- time, so the refresh policy only has to keep older buckets current.
SELECT add_continuous_aggregate_policy('service_duration_histogram',
  start_offset => INTERVAL '1 day', end_offset => INTERVAL '15 minutes', schedule_interval => INTERVAL '15 minutes');--> statement-breakpoint

SELECT add_continuous_aggregate_policy('service_status_counts',
  start_offset => INTERVAL '1 day', end_offset => INTERVAL '15 minutes', schedule_interval => INTERVAL '15 minutes');--> statement-breakpoint

-- log_event drops rows after 30 days. A continuous aggregate keeps its own
-- storage and would otherwise outlive the data it summarises indefinitely.
SELECT add_retention_policy('service_duration_histogram', drop_after => INTERVAL '30 days');--> statement-breakpoint

SELECT add_retention_policy('service_status_counts', drop_after => INTERVAL '30 days');