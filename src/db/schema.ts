import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * name/bio only — `initials` (API_CONTRACT.md §2 UserSummary) is
 * server-computed from `name` at serialization time (see lib/viewer.ts's
 * `computeInitials`), never stored, per the contract's own note that this
 * is so the frontend doesn't reimplement the rule.
 */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  bio: text("bio"),
  createdAt: text("created_at").notNull(),
});

/**
 * Mirrors API_CONTRACT.md §2's CreateRunRequest/RunDetail. `going_count` is
 * NOT stored — it's derived from `join_requests` (count of `approved` rows)
 * at read time (lib/viewer.ts), so it can never drift from the requests
 * that actually back it.
 */
export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    startsAt: text("starts_at").notNull(), // ZonedDateTimeString
    endsAt: text("ends_at").notNull(),
    timezone: text("timezone").notNull(),
    format: text("format", { enum: ["5v5_full_court", "3v3_half_court"] }).notNull(),
    venueName: text("venue_name").notNull(),
    exactAddress: text("exact_address").notNull(),
    city: text("city", { enum: ["SF", "OAK"] }).notNull(),
    hostId: text("host_id")
      .notNull()
      .references(() => users.id),
    capacity: integer("capacity"), // null = unlimited
    visibility: text("visibility", { enum: ["public", "private"] }).notNull(),
    autoApprove: integer("auto_approve", { mode: "boolean" }).notNull().default(false),
    isDraft: integer("is_draft", { mode: "boolean" }).notNull().default(true),
    // Soft-cancel — the run and its history stay around; `is_cancelled` is
    // derived from this being non-null (see lib/viewer.ts). Distinct from
    // DELETE (hard removal) — see API_CONTRACT.md §3.1's cancel-vs-delete note.
    cancelledAt: text("cancelled_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    hostIdx: index("runs_host_idx").on(table.hostId),
    cityFormatIdx: index("runs_city_format_idx").on(table.city, table.format),
    startsAtIdx: index("runs_starts_at_idx").on(table.startsAt),
  }),
);

/**
 * An approved JoinRequest IS roster membership (API_CONTRACT.md §1/§6 — "no
 * separate Attendee resource"). At most one *active* (pending/approved) row
 * per (run_id, requester_id) is enforced in application logic (lib
 * routes/requests.ts), not a DB constraint, since old withdrawn/declined
 * rows must be allowed to coexist with a fresh request.
 */
export const joinRequests = sqliteTable(
  "join_requests",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    requesterId: text("requester_id")
      .notNull()
      .references(() => users.id),
    message: text("message"),
    status: text("status", { enum: ["pending", "approved", "declined", "withdrawn"] }).notNull(),
    declineReason: text("decline_reason"),
    createdAt: text("created_at").notNull(),
    decidedAt: text("decided_at"),
  },
  (table) => ({
    runStatusIdx: index("requests_run_status_idx").on(table.runId, table.status),
    requesterIdx: index("requests_requester_idx").on(table.requesterId),
  }),
);
