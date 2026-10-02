-- Per-minute request/error counts for the timeseries chart.
--
-- The chart reads only `requests` and `errors` off each bucket, and minute is
-- the finest granularity the API ever asks for, so one minute is enough:
-- coarser granularities re-bucket these rows with time_bucket.
--
-- avg_duration is exact from duration_sum/n, since averages compose. The
-- percentiles the endpoint can also return are deliberately absent -- they do
-- not compose, so the repository falls back to log_event when they are asked
-- for.

CREATE MATERIALIZED VIEW service_minute_counts
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
  time_bucket(INTERVAL '1 minute', timestamp) AS bucket,
  service_id,
  environment,
  COUNT(*)::int AS n,
  COUNT(*) FILTER (WHERE status >= 400)::int AS errors,
  SUM(duration)::bigint AS duration_sum
FROM log_event
GROUP BY 1, 2, 3
WITH NO DATA;

-- materialized_only = false merges the trailing minutes from raw at query
-- time, so a 5-minute schedule only affects how often background work runs,
-- not how current the result is.
SELECT add_continuous_aggregate_policy('service_minute_counts',
  start_offset => INTERVAL '1 day', end_offset => INTERVAL '1 minute', schedule_interval => INTERVAL '5 minutes');

-- log_event drops rows after 30 days; a continuous aggregate keeps its own
-- storage and would otherwise outlive the data it summarises.
SELECT add_retention_policy('service_minute_counts', drop_after => INTERVAL '30 days');