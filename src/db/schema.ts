import { sqliteTable, text, integer, index, uniqueIndex, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * `id` is the Clerk user id (`sub` claim) — Clerk is the identity source of
 * truth, rows are provisioned/kept in sync by routes/webhooks.ts's
 * `user.created`/`user.updated` handler, never created by app code directly.
 * email/phone are both nullable (Clerk sign-up can be email-first,
 * phone-first, or either) but at least one must be present — enforced by
 * the check constraint below rather than app code, matching this schema's
 * existing preference for DB-level invariants (see join_requests' unique
 * index note). `initials` (API_CONTRACT.md §2 UserSummary) is
 * server-computed from `name` at serialization time (see lib/viewer.ts's
 * `computeInitials`), never stored, per the contract's own note that this
 * is so the frontend doesn't reimplement the rule.
 */
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").unique(),
    phone: text("phone").unique(),
    name: text("name").notNull(),
    bio: text("bio"),
    location: text("location", { enum: ["SF", "OAK", "SJ", "SD", "NYC"] }).notNull().default("SD"),
    gender: text("gender", { enum: ["Prefer not to say", "Woman", "Man", "Non-binary"] }).notNull().default("Prefer not to say"),
    position: text("position", { enum: ["Flexible", "Point guard", "Shooting guard", "Forward", "Center"] }).notNull().default("Flexible"),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    hasIdentifierCheck: check("users_has_identifier_check", sql`${table.email} IS NOT NULL OR ${table.phone} IS NOT NULL`),
  }),
);

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
    city: text("city", { enum: ["SF", "OAK", "SJ", "SD", "NYC"] }).notNull(),
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
 * separate Attendee resource"). At most one row EVER per (run_id,
 * requester_id) — a viewer's relationship to a run is a single record, not
 * an append-only event log. Re-requesting after a withdraw/decline reuses
 * and resets the same row (routes/requests.ts's POST "/" does this as an
 * UPSERT) rather than inserting a new one, so `id` is a stable identifier
 * for "this requester's relationship to this run" for its whole lifetime,
 * and old declined/withdrawn state is intentionally overwritten, not kept
 * as history — see API_CONTRACT.md §2's note on this for the product
 * reasoning (a "my requests" list should show one row per game, not one
 * per attempt).
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
    /**
     * The actual enforcement of "one row ever per (run, requester)" — a
     * full (non-partial) unique index, so routes/requests.ts's POST "/" can
     * target it with `onConflictDoUpdate`. This is also what closes the
     * race a double-click can otherwise cause: two truly concurrent
     * requests both attempting to create/reactivate the same row resolve
     * atomically at the database level regardless of timing (the SELECT
     * pre-check in that route is only a fast/friendly pre-check, not the
     * actual guarantee).
     */
    oneRequestPerViewerIdx: uniqueIndex("requests_one_per_viewer_idx").on(table.runId, table.requesterId),
  }),
);
