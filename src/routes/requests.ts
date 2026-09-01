import { Hono } from "hono";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { Env, AppVariables } from "../types";
import { getDb } from "../db/client";
import { joinRequests, users } from "../db/schema";
import { Errors } from "../lib/errors";
import { requireAuth } from "../lib/auth";
import { decodeCursor, encodeCursor, parseLimit } from "../lib/pagination";
import { createJoinRequestSchema, declineJoinRequestSchema } from "../lib/validation";
import { loadRun, loadUser, approvedCounts, assertRunVisible } from "../lib/loaders";
import { toJoinRequest, type JoinRequestRow } from "../lib/viewer";
import type { CursorPage, JoinRequest } from "../contract-types";

export const requestsRoute = new Hono<{ Bindings: Env; Variables: AppVariables }>();

async function loadRequest(db: ReturnType<typeof getDb>, runId: string, reqId: string): Promise<JoinRequestRow> {
  const [row] = await db
    .select()
    .from(joinRequests)
    .where(and(eq(joinRequests.id, reqId), eq(joinRequests.runId, runId)))
    .limit(1);
  if (!row) throw Errors.requestNotFound();
  return row;
}

// ---------------------------------------------------------------------------
// POST /runs/:runId/requests — request to join
// ---------------------------------------------------------------------------
requestsRoute.post("/", async (c) => {
  const viewerId = requireAuth(c);
  const db = getDb(c.env);
  const run = await loadRun(db, c.req.param("runId")!);
  assertRunVisible(run, viewerId);

  if (run.hostId === viewerId) throw Errors.cannotRequestOwnRun();
  if (run.cancelledAt !== null) throw Errors.runCancelled();

  const json = await c.req.json().catch(() => ({}));
  const parsed = createJoinRequestSchema.safeParse(json);
  if (!parsed.success) throw Errors.validation("Invalid request body.");

  const [existing] = await db
    .select()
    .from(joinRequests)
    .where(and(eq(joinRequests.runId, run.id), eq(joinRequests.requesterId, viewerId)))
    .limit(1);
  // Fast/friendly pre-check — an existing pending/approved row means
  // there's nothing to (re)request. Not the actual guarantee: see the
  // onConflictDoUpdate below, which is what makes this race-proof.
  if (existing && (existing.status === "pending" || existing.status === "approved")) {
    throw Errors.alreadyRequested();
  }

  const going = (await approvedCounts(db, [run.id])).get(run.id) ?? 0;
  const willAutoApprove = run.autoApprove;
  if (willAutoApprove && run.capacity !== null && going >= run.capacity) {
    throw Errors.runFull();
  }

  const now = new Date().toISOString();
  // Only used if this is truly the first request ever for (run, viewer) —
  // a reactivation (existing withdrawn/declined row) reuses that row's own
  // id via onConflictDoUpdate instead, per db/schema.ts's "one row ever"
  // design: a viewer's relationship to a run is a single record, not an
  // append-only log, so re-requesting resets it in place rather than
  // creating a second row for the same game.
  const row: JoinRequestRow = {
    id: `req_${crypto.randomUUID()}`,
    runId: run.id,
    requesterId: viewerId,
    message: parsed.data.message ?? null,
    status: willAutoApprove ? "approved" : "pending",
    declineReason: null,
    createdAt: now,
    decidedAt: willAutoApprove ? now : null,
  };

  const result = await db
    .insert(joinRequests)
    .values(row)
    .onConflictDoUpdate({
      target: [joinRequests.runId, joinRequests.requesterId],
      set: {
        message: row.message,
        status: row.status,
        declineReason: null,
        createdAt: row.createdAt,
        decidedAt: row.decidedAt,
      },
      // Only reactivate a *resolved* row. If the existing row is already
      // pending/approved, this WHERE doesn't match, so SQLite performs
      // neither the insert nor the update — 0 rows changed — which is
      // exactly the ALREADY_REQUESTED case, now closed atomically even
      // under true concurrency (the pre-check above can't be, on its own).
      setWhere: sql`${joinRequests.status} IN ('withdrawn', 'declined')`,
    });
  if (result.meta.changes === 0) throw Errors.alreadyRequested();

  const [finalRow] = await db
    .select()
    .from(joinRequests)
    .where(and(eq(joinRequests.runId, run.id), eq(joinRequests.requesterId, viewerId)))
    .limit(1);
  const requester = await loadUser(db, viewerId);
  const body: JoinRequest = toJoinRequest(finalRow!, requester);
  return c.json(body, 201);
});

// ---------------------------------------------------------------------------
// GET /runs/:runId/requests — host only, default status=pending
// ---------------------------------------------------------------------------
requestsRoute.get("/", async (c) => {
  const viewerId = requireAuth(c);
  const db = getDb(c.env);
  const run = await loadRun(db, c.req.param("runId")!);
  if (run.hostId !== viewerId) throw Errors.notHost();

  const status = c.req.query("status") ?? "pending";
  const limit = parseLimit(c.req.query("limit"));
  const cursorParam = c.req.query("cursor");

  const conditions = [eq(joinRequests.runId, run.id)];
  if (status !== "all") {
    conditions.push(eq(joinRequests.status, status as JoinRequestRow["status"]));
  }
  if (cursorParam) {
    const cursor = decodeCursor(cursorParam);
    if (!cursor) throw Errors.validation("Invalid cursor.", "cursor");
    // Descending order (newest first) — page continues with strictly *older* rows.
    conditions.push(
      or(
        lt(joinRequests.createdAt, cursor.sortValue),
        and(eq(joinRequests.createdAt, cursor.sortValue), lt(joinRequests.id, cursor.id)),
      )!,
    );
  }

  const page = await db
    .select()
    .from(joinRequests)
    .where(and(...conditions))
    .orderBy(desc(joinRequests.createdAt), desc(joinRequests.id))
    .limit(limit + 1);

  const hasMore = page.length > limit;
  const items = hasMore ? page.slice(0, limit) : page;
  const requesterIds = [...new Set(items.map((r) => r.requesterId))];
  const requesters = requesterIds.length ? await db.select().from(users).where(inArray(users.id, requesterIds)) : [];
  const byId = new Map(requesters.map((u) => [u.id, u]));

  const last = items.at(-1);
  const body: CursorPage<JoinRequest> = {
    items: items.map((r) => toJoinRequest(r, byId.get(r.requesterId)!)),
    next_cursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
  };
  return c.json(body);
});

// ---------------------------------------------------------------------------
// GET /runs/:runId/requests/:reqId — host or requester
// ---------------------------------------------------------------------------
requestsRoute.get("/:reqId", async (c) => {
  const viewerId = requireAuth(c);
  const db = getDb(c.env);
  const run = await loadRun(db, c.req.param("runId")!);
  const request = await loadRequest(db, run.id, c.req.param("reqId")!);
  if (run.hostId !== viewerId && request.requesterId !== viewerId) throw Errors.notRequester();

  const requester = await loadUser(db, request.requesterId);
  return c.json(toJoinRequest(request, requester));
});

// ---------------------------------------------------------------------------
// POST /runs/:runId/requests/:reqId/approve — host only
// ---------------------------------------------------------------------------
requestsRoute.post("/:reqId/approve", async (c) => {
  const viewerId = requireAuth(c);
  const db = getDb(c.env);
  const run = await loadRun(db, c.req.param("runId")!);
  if (run.hostId !== viewerId) throw Errors.notHost();
  if (run.cancelledAt !== null) throw Errors.runCancelled();

  const request = await loadRequest(db, run.id, c.req.param("reqId")!);
  if (request.status !== "pending") throw Errors.requestNotPending();

  const going = (await approvedCounts(db, [run.id])).get(run.id) ?? 0;
  if (run.capacity !== null && going >= run.capacity) throw Errors.runFull();

  const decidedAt = new Date().toISOString();
  await db
    .update(joinRequests)
    .set({ status: "approved", decidedAt })
    .where(eq(joinRequests.id, request.id));

  const requester = await loadUser(db, request.requesterId);
  return c.json(toJoinRequest({ ...request, status: "approved", decidedAt }, requester));
});

// ---------------------------------------------------------------------------
// POST /runs/:runId/requests/:reqId/decline — host only
// ---------------------------------------------------------------------------
requestsRoute.post("/:reqId/decline", async (c) => {
  const viewerId = requireAuth(c);
  const db = getDb(c.env);
  const run = await loadRun(db, c.req.param("runId")!);
  if (run.hostId !== viewerId) throw Errors.notHost();
  if (run.cancelledAt !== null) throw Errors.runCancelled();

  const request = await loadRequest(db, run.id, c.req.param("reqId")!);
  if (request.status !== "pending") throw Errors.requestNotPending();

  const json = await c.req.json().catch(() => ({}));
  const parsed = declineJoinRequestSchema.safeParse(json);
  if (!parsed.success) throw Errors.validation("Invalid request body.");

  const decidedAt = new Date().toISOString();
  const declineReason = parsed.data.decline_reason ?? null;
  await db
    .update(joinRequests)
    .set({ status: "declined", decidedAt, declineReason })
    .where(eq(joinRequests.id, request.id));

  const requester = await loadUser(db, request.requesterId);
  return c.json(toJoinRequest({ ...request, status: "declined", decidedAt, declineReason }, requester));
});

// ---------------------------------------------------------------------------
// POST /runs/:runId/requests/:reqId/withdraw — requester only
// ---------------------------------------------------------------------------
requestsRoute.post("/:reqId/withdraw", async (c) => {
  const viewerId = requireAuth(c);
  const db = getDb(c.env);
  const run = await loadRun(db, c.req.param("runId")!);
  const request = await loadRequest(db, run.id, c.req.param("reqId")!);
  if (request.requesterId !== viewerId) throw Errors.notRequester();
  if (request.status === "declined" || request.status === "withdrawn") throw Errors.requestAlreadyResolved();

  const decidedAt = new Date().toISOString();
  await db.update(joinRequests).set({ status: "withdrawn", decidedAt }).where(eq(joinRequests.id, request.id));

  const requester = await loadUser(db, request.requesterId);
  return c.json(toJoinRequest({ ...request, status: "withdrawn", decidedAt }, requester));
});
