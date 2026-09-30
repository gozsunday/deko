export const queryKeys = {
  apiAuth: () => ["api-auth"] as const,
  services: () => ["services"] as const,
  service: (serviceId: string) => ["service", serviceId] as const,
  logs: (serviceId: string, filters: Record<string, unknown>) =>
    ["logs", serviceId, filters] as const,
  singleLog: (serviceId: string, logId: string) =>
    ["log", serviceId, logId] as const,
  overviewStats: (serviceId: string, filters: Record<string, unknown>) =>
    ["overview-stats", serviceId, filters] as const,
  timeseriesStats: (serviceId: string, filters: Record<string, unknown>) =>
    ["timeseries-stats", serviceId, filters] as const,
  statusBreakdown: (serviceId: string, filters: Record<string, unknown>) =>
    ["status-breakdown", serviceId, filters] as const,
  logLevelBreakdown: (serviceId: string, filters: Record<string, unknown>) =>
    ["log-level-breakdown", serviceId, filters] as const,
  topEndpoints: (serviceId: string, filters: Record<string, unknown>) =>
    ["top-endpoints", serviceId, filters] as const,
  errorGroups: (serviceId: string, filters: Record<string, unknown>) =>
    ["error-groups", serviceId, filters] as const,
};
