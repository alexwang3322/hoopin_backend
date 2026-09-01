import { Hono } from "hono";
import { and, asc, desc, eq, gt, inArray, or } from "drizzle-orm";
import type { Env, AppVariables } from "../types";
import { getDb } from "../db/client";
import { runs, users, joinRequests } from "../db/schema";
import { Errors } from "../lib/errors";
import { requireAuth } from "../lib/auth";
import { decodeCursor, encodeCursor, parseLimit } from "../lib/pagination";
import { createRunSchema, updateRunSchema } from "../lib/validation";
import { zonedDateTimeString, assertValidTimeZone } from "../lib/time";
import { loadRun, loadUser, approvedCounts, latestViewerRequests, assertRunVisible } from "../lib/loaders";
import {
  toRunSummary,
  toRunDetail,
  viewerActionFor,
  viewerStatusFor,
  type RunRow,
  type UserRow,
  type JoinRequestRow,
} from "../lib/viewer";
import type { CursorPage, RunSummary } from "../contract-types";

export const runsRoute = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// ---------------------------------------------------------------------------
// GET /runs — discover feed
// ---------------------------------------------------------------------------
runsRoute.get("/", async (c) => {
  const db = getDb(c.env);
  const viewerId = c.get("viewerId");
  const cityFilter = c.req.query("city");
  const formatFilter = c.req.query("format");
  const limit = parseLimit(c.req.query("limit"));
  const cursorParam = c.req.query("cursor");

  const conditions = [eq(runs.isDraft, false), eq(runs.visibility, "public")];
  if (cityFilter === "SF" || cityFilter === "OAK") conditions.push(eq(runs.city, cityFilter));
  if (formatFilter === "5v5_full_court" || formatFilter === "3v3_half_court") conditions.push(eq(runs.format, formatFilter));

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

  const hostIds = [...new Set(items.map((r) => r.hostId))];
  const runIds = items.map((r) => r.id);
  const [hosts, counts, myLatest] = await Promise.all([
    hostIds.length ? db.select().from(users).where(inArray(users.id, hostIds)) : Promise.resolve([]),
    approvedCounts(db, runIds),
    latestViewerRequests(db, viewerId, runIds),
  ]);
  const hostById = new Map(hosts.map((h) => [h.id, h]));

  const summaries: RunSummary[] = items.map((run) => {
    const host = hostById.get(run.hostId)!;
    const going = counts.get(run.id) ?? 0;
    const latest = myLatest.get(run.id);
    const action = viewerActionFor(run, going, viewerId, latest);
    const status = viewerStatusFor(action, latest?.status);
    return toRunSummary(run, host, going, status);
  });

  const last = items.at(-1);
  const body: CursorPage<RunSummary> = {
    items: summaries,
    next_cursor: hasMore && last ? encodeCursor(last.startsAt, last.id) : null,
  };
  return c.json(body);
});

// ---------------------------------------------------------------------------
// POST /runs — create (draft or published)
// ---------------------------------------------------------------------------
runsRoute.post("/", async (c) => {
  const viewerId = requireAuth(c);
  const db = getDb(c.env);

  const json = await c.req.json().catch(() => null);
  const parsed = createRunSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw Errors.validation(first?.message ?? "Invalid request body.", first?.path.join(".") || undefined);
  }
  const body = parsed.data;

  try {
    assertValidTimeZone(body.timezone);
  } catch {
    throw Errors.validation("Unknown IANA timezone.", "timezone");
  }

  const id = `ev_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const row: RunRow = {
    id,
    title: body.title,
    description: body.description,
    startsAt: zonedDateTimeString(body.date, body.start_time, body.timezone),
    endsAt: zonedDateTimeString(body.date, body.end_time, body.timezone),
    timezone: body.timezone,
    format: body.format,
    venueName: body.venue_name,
    exactAddress: body.exact_address,
    city: body.city,
    hostId: viewerId,
    capacity: body.capacity,
    visibility: body.visibility,
    autoApprove: body.auto_approve,
    isDraft: !body.publish,
    createdAt: now,
  };
  await db.insert(runs).values(row);

  const host = await loadUser(db, viewerId);
  const action = viewerActionFor(row, 0, viewerId, undefined);
  const detail = toRunDetail(row, host, 0, viewerStatusFor(action, undefined), {
    attendees: [],
    viewerAction: action,
    viewerId,
  });
  return c.json(detail, 201);
});

// ---------------------------------------------------------------------------
// GET /runs/:runId — detail, shape per viewer
// ---------------------------------------------------------------------------
runsRoute.get("/:runId", async (c) => {
  const db = getDb(c.env);
  const viewerId = c.get("viewerId");
  const run = await loadRun(db, c.req.param("runId"));
  assertRunVisible(run, viewerId);

  const [host, going, latest] = await Promise.all([
    loadUser(db, run.hostId),
    approvedCounts(db, [run.id]).then((m) => m.get(run.id) ?? 0),
    latestViewerRequests(db, viewerId, [run.id]).then((m) => m.get(run.id)),
  ]);

  const action = viewerActionFor(run, going, viewerId, latest);
  const status = viewerStatusFor(action, latest?.status);

  const attendeeRows = await db
    .select()
    .from(joinRequests)
    .where(and(eq(joinRequests.runId, run.id), eq(joinRequests.status, "approved")));
  const attendeeUsers = attendeeRows.length
    ? await db.select().from(users).where(
        inArray(
          users.id,
          attendeeRows.map((r) => r.requesterId),
        ),
      )
    : [];

  let pendingRequests: { rows: JoinRequestRow[]; requesterById: Map<string, UserRow>; pendingCount: number } | undefined;
  if (run.hostId === viewerId) {
    const pending = await db
      .select()
      .from(joinRequests)
      .where(and(eq(joinRequests.runId, run.id), eq(joinRequests.status, "pending")))
      .orderBy(desc(joinRequests.createdAt));
    const requesters = pending.length
      ? await db.select().from(users).where(
          inArray(
            users.id,
            pending.map((r) => r.requesterId),
          ),
        )
      : [];
    pendingRequests = {
      rows: pending,
      requesterById: new Map(requesters.map((u) => [u.id, u])),
      pendingCount: pending.length,
    };
  }

  let myRequester: UserRow | undefined;
  if (latest && viewerId) myRequester = await loadUser(db, viewerId);

  const detail = toRunDetail(run, host, going, status, {
    attendees: attendeeUsers,
    viewerAction: action,
    viewerId,
    myActiveRequest: latest,
    myRequester,
    pendingRequests,
  });
  return c.json(detail);
});

// ---------------------------------------------------------------------------
// PATCH /runs/:runId — host only
// ---------------------------------------------------------------------------
runsRoute.patch("/:runId", async (c) => {
  const viewerId = requireAuth(c);
  const db = getDb(c.env);
  const run = await loadRun(db, c.req.param("runId"));
  if (run.hostId !== viewerId) throw Errors.notHost();

  const json = await c.req.json().catch(() => null);
  const parsed = updateRunSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw Errors.validation(first?.message ?? "Invalid request body.", first?.path.join(".") || undefined);
  }
  const body = parsed.data;

  if (body.capacity !== undefined && body.capacity !== null) {
    const going = (await approvedCounts(db, [run.id])).get(run.id) ?? 0;
    if (body.capacity < going) {
      throw Errors.validation(`capacity can't be less than the current going_count (${going}).`, "capacity");
    }
  }
  if (body.timezone) {
    try {
      assertValidTimeZone(body.timezone);
    } catch {
      throw Errors.validation("Unknown IANA timezone.", "timezone");
    }
  }

  const timezone = body.timezone ?? run.timezone;
  const patch: Partial<RunRow> = {
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
    ...(body.format !== undefined ? { format: body.format } : {}),
    ...(body.venue_name !== undefined ? { venueName: body.venue_name } : {}),
    ...(body.exact_address !== undefined ? { exactAddress: body.exact_address } : {}),
    ...(body.city !== undefined ? { city: body.city } : {}),
    ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
    ...(body.visibility !== undefined ? { visibility: body.visibility } : {}),
    ...(body.auto_approve !== undefined ? { autoApprove: body.auto_approve } : {}),
    ...(body.publish !== undefined ? { isDraft: !body.publish } : {}),
  };
  if (body.date !== undefined || body.start_time !== undefined) {
    patch.startsAt = zonedDateTimeString(body.date ?? run.startsAt.slice(0, 10), body.start_time ?? "00:00", timezone);
  }
  if (body.date !== undefined || body.end_time !== undefined) {
    patch.endsAt = zonedDateTimeString(body.date ?? run.startsAt.slice(0, 10), body.end_time ?? "00:00", timezone);
  }

  await db.update(runs).set(patch).where(eq(runs.id, run.id));
  const updated = await loadRun(db, run.id);
  const host = await loadUser(db, updated.hostId);
  const going = (await approvedCounts(db, [updated.id])).get(updated.id) ?? 0;
  const action = viewerActionFor(updated, going, viewerId, undefined);
  const attendeeRows = await db
    .select()
    .from(joinRequests)
    .where(and(eq(joinRequests.runId, updated.id), eq(joinRequests.status, "approved")));
  const attendeeUsers = attendeeRows.length
    ? await db.select().from(users).where(
        inArray(
          users.id,
          attendeeRows.map((r) => r.requesterId),
        ),
      )
    : [];

  const detail = toRunDetail(updated, host, going, "host", {
    attendees: attendeeUsers,
    viewerAction: action,
    viewerId,
  });
  return c.json(detail);
});

// ---------------------------------------------------------------------------
// DELETE /runs/:runId — host only
// ---------------------------------------------------------------------------
runsRoute.delete("/:runId", async (c) => {
  const viewerId = requireAuth(c);
  const db = getDb(c.env);
  const run = await loadRun(db, c.req.param("runId"));
  if (run.hostId !== viewerId) throw Errors.notHost();
  await db.delete(runs).where(eq(runs.id, run.id)); // join_requests cascade via FK
  return c.body(null, 204);
});
