-- Endpoint leaderboard rollup, plus a foreign key to keep service_id honest.
--
-- log_event holds 43k distinct paths, but 14.7k of them are seen exactly once:
-- the cardinality is numeric ids in the path, not endpoint shapes. Collapsing
-- /[0-9]+ to /:id turns 43,140 paths into 27 shapes, which is what makes a
-- rollup worth having here.
--
-- This rollup carries counts and a duration sum, so requests, errors,
-- error_rate and avg_duration are exact. It carries no duration distribution,
-- so the p50/p95/p99 sort orders read log_event instead.

-- 0 orphans today; this keeps it that way
ALTER TABLE log_event
  ADD CONSTRAINT log_event_service_id_fkey
  FOREIGN KEY (service_id) REFERENCES service(id);

CREATE MATERIALIZED VIEW service_endpoint_counts
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
  time_bucket(INTERVAL '15 minutes', timestamp) AS bucket,
  service_id,
  environment,
  method,
  regexp_replace(path, '/[0-9]+', '/:id', 'g') AS path_shape,
  COUNT(*)::int AS requests,
  COUNT(*) FILTER (WHERE status >= 400)::int AS errors,
  SUM(duration)::bigint AS duration_sum
FROM log_event
GROUP BY 1, 2, 3, 4, 5
WITH NO DATA;

-- materialized_only = false merges the trailing buckets from raw at query
-- time, so the schedule only decides how often background work runs
SELECT add_continuous_aggregate_policy('service_endpoint_counts',
  start_offset => INTERVAL '1 day', end_offset => INTERVAL '15 minutes', schedule_interval => INTERVAL '15 minutes');

-- log_event drops rows after 30 days; without this the rollup outlives its
-- source indefinitely
SELECT add_retention_policy('service_endpoint_counts', drop_after => INTERVAL '30 days');