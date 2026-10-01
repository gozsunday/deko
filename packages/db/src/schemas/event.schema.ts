import { type InferSelectModel, relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// oxlint-disable-next-line import/no-cycle
import { service } from "./service.schema";

export const levelEnum = pgEnum("level", ["info", "warn", "error", "debug"]);
export const methodEnum = pgEnum("method", [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "OPTIONS",
  "HEAD",
  "CONNECT",
  "TRACE",
]);

export const logEvent = pgTable(
  "log_event",
  {
    id: uuid("id").defaultRandom().notNull(),
    serviceId: uuid("service_id").notNull(),
    timestamp: timestamp("timestamp").notNull(),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
    level: levelEnum("level").notNull(),
    method: methodEnum("method").notNull(),
    path: text("path").notNull(),
    status: integer("status").notNull(),
    duration: integer("duration").notNull(),
    environment: text("environment").notNull(),
    requestId: text("request_id").notNull(),
    ipHash: text("ip_hash").notNull(),
    userAgent: text("user_agent").notNull(),
    message: text("message"),
    sessionId: text("session_id"),
    meta: jsonb("meta").default({}).notNull(),
  },
  (table) => [
    // timescaledb requires the partitioning column (timestamp) in the primary key
    primaryKey({ columns: [table.id, table.timestamp] }),

    // composite indexes for filtering by service and time
    index("log_event_service_timestamp_idx").on(
      table.serviceId,
      table.timestamp,
    ),

    // composite indexes for other filters
    index("log_event_service_level_time_idx").on(
      table.serviceId,
      table.level,
      table.timestamp.desc(),
    ),
    index("log_event_service_status_time_idx").on(
      table.serviceId,
      table.status,
      table.timestamp.desc(),
    ),
    index("log_event_service_env_time_idx").on(
      table.serviceId,
      table.environment,
      table.timestamp.desc(),
    ),
  ],
);
export const logEventRelations = relations(logEvent, ({ one }) => ({
  service: one(service, {
    fields: [logEvent.serviceId],
    references: [service.id],
  }),
}));

export const deadLetter = pgTable("dead_letter", {
  id: uuid("id").primaryKey().defaultRandom(),
  serviceId: uuid("service_id").notNull(),
  failedAt: timestamp("failed_at").defaultNow().notNull(),
  reason: text("reason").notNull(),
  payload: jsonb("payload").default({}).notNull(),
});
export const deadLetterRelations = relations(deadLetter, ({ one }) => ({
  service: one(service, {
    fields: [deadLetter.serviceId],
    references: [service.id],
  }),
}));

export type DeadLetter = InferSelectModel<typeof deadLetter>;
