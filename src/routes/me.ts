import { Hono } from "hono";
import { createClerkClient } from "@clerk/backend";
import { and, asc, desc, eq, gt, inArray, lt, or } from "drizzle-orm";
import type { Env, AppVariables } from "../types";
import { getDb } from "../db/client";
import { runs, users, joinRequests } from "../db/schema";
import { requireAuth } from "../lib/auth";
import { ApiError, Errors } from "../lib/errors";
import { decodeCursor, encodeCursor, parseLimit } from "../lib/pagination";
import { loadUser, approvedCounts } from "../lib/loaders";
import { toAccountProfile, toRunSummary, toJoinRequest } from "../lib/viewer";
import { updateAccountSchema } from "../lib/validation";
import type { CursorPage, JoinRequestWithRun, RunSummary, HeaderCounts } from "../contract-types";

export const meRoute = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// GET /me — current viewer's profile
meRoute.get("/", async (c) => {
  const viewerId = requireAuth(c);
  const db = getDb(c.env);
  const me = await loadUser(db, viewerId);
  return c.json(toAccountProfile(me));
});

// PATCH /me — update the signed-in viewer's account. Clerk remains the source of truth for name;
// app-owned bio/preferences are stored in D1. The webhook's later name sync is idempotent.
meRoute.patch("/", async (c) => {
  const viewerId = requireAuth(c);
  const db = getDb(c.env);
  const json = await c.req.json().catch(() => null);
  const parsed = updateAccountSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw Errors.validation(first?.message ?? "Invalid profile.", first?.path.join(".") || undefined);
  }

  const existing = await loadUser(db, viewerId);
  const body = parsed.data;
  const name = body.name.replace(/\s+/g, " ").trim();
  if (name !== existing.name && c.env.DEV_AUTH !== "true") {
    const [firstName, ...lastNameParts] = name.split(" ");
    try {
      const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY });
      await clerk.users.updateUser(viewerId, { firstName, lastName: lastNameParts.join(" ") });
    } catch (error) {
      console.error("profile name update failed", error);
      throw new ApiError(409, "NAME_UPDATE_FAILED", "Couldn't update your name. Please try again.", "name");
    }
  }

  await db.update(users).set({
    name,
    bio: body.bio,
    location: body.location,
    gender: body.gender,
    position: body.position,
  }).where(eq(users.id, viewerId));
  return c.json(toAccountProfile(await loadUser(db, viewerId)));
});

// GET /me/requests — "My Runs", sorted created_at desc
meRoute.get("/requests", async (c) => {
  const viewerId = requireAuth(c);
  const db = getDb(c.env);
  const limit = parseLimit(c.req.query("limit"));
  const cursorParam = c.req.query("cursor");

  const conditions = [eq(joinRequests.requesterId, viewerId)];
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

  const runIds = [...new Set(items.map((r) => r.runId))];
  const requesterIds = [...new Set(items.map((r) => r.requesterId))];
  const [runRows, requesterRows] = await Promise.all([
    runIds.length ? db.select().from(runs).where(inArray(runs.id, runIds)) : Promise.resolve([]),
    requesterIds.length ? db.select().from(users).where(inArray(users.id, requesterIds)) : Promise.resolve([]),
  ]);
  const hostIds = [...new Set(runRows.map((r) => r.hostId))];
  const hostRows = hostIds.length ? await db.select().from(users).where(inArray(users.id, hostIds)) : [];
  const hostById = new Map(hostRows.map((u) => [u.id, u]));
  const runById = new Map(runRows.map((r) => [r.id, r]));
  const requesterById = new Map(requesterRows.map((u) => [u.id, u]));
  const counts = await approvedCounts(db, runIds);

  const rows: JoinRequestWithRun[] = items.map((r) => {
    const run = runById.get(r.runId)!;
    const going = counts.get(run.id) ?? 0;
    // The viewer *is* this request's requester, so their run-relative status
    // is exactly this request's own status.
    const summary: RunSummary = toRunSummary(run, hostById.get(run.hostId)!, going, r.status);
    return { ...toJoinRequest(r, requesterById.get(r.requesterId)!), run: summary };
  });

  const last = items.at(-1);
  const body: CursorPage<JoinRequestWithRun> = {
    items: rows,
    next_cursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
  };
  return c.json(body);
});

// GET /me/hosting — runs the viewer hosts, incl. drafts. Same "upcoming
// first" ordering as Discover (GET /runs).
meRoute.get("/hosting", async (c) => {
  const viewerId = requireAuth(c);
  const db = getDb(c.env);
  const limit = parseLimit(c.req.query("limit"));
  const cursorParam = c.req.query("cursor");

  const conditions = [eq(runs.hostId, viewerId)];
  if (cursorParam) {
    const cursor = decodeCursor(cursorParam);
    if (!cursor) throw Errors.validation("Invalid cursor.", "cursor");
    conditions.push(
      or(gt(runs.startsAt, cursor.sortValue), and(eq(runs.startsAt, cursor.sortValue), gt(runs.id, cursor.id)))!,
    );
  }

  const page = await db
    .select()
    .from(runs)
    .where(and(...conditions))
    .orderBy(asc(runs.startsAt), asc(runs.id))
    .limit(limit + 1);

  const hasMore = page.length > limit;
  const items = hasMore ? page.slice(0, limit) : page;
  const host = await loadUser(db, viewerId);
  const counts = await approvedCounts(
    db,
    items.map((r) => r.id),
  );

  const summaries: RunSummary[] = items.map((run) => toRunSummary(run, host, counts.get(run.id) ?? 0, "host"));
  const last = items.at(-1);
  const body: CursorPage<RunSummary> = {
    items: summaries,
    next_cursor: hasMore && last ? encodeCursor(last.startsAt, last.id) : null,
  };
  return c.json(body);
});

// GET /me/counts — header badge counts
meRoute.get("/counts", async (c) => {
  const viewerId = requireAuth(c);
  const db = getDb(c.env);

  const myPendingRows = await db
    .select()
    .from(joinRequests)
    .where(and(eq(joinRequests.requesterId, viewerId), eq(joinRequests.status, "pending")));

  const myRunRows = await db.select({ id: runs.id }).from(runs).where(eq(runs.hostId, viewerId));
  const myRunIds = myRunRows.map((r) => r.id);
  let hostingPendingCount = 0;
  if (myRunIds.length) {
    const pendingAcrossMyRuns = await db
      .select()
      .from(joinRequests)
      .where(and(inArray(joinRequests.runId, myRunIds), eq(joinRequests.status, "pending")));
    hostingPendingCount = pendingAcrossMyRuns.length;
  }

  const body: HeaderCounts = {
    my_pending_requests: myPendingRows.length,
    hosting_pending_requests: hostingPendingCount,
  };
  return c.json(body);
});
