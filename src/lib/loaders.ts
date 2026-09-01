import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { getDb } from "../db/client";
import { runs, users, joinRequests } from "../db/schema";
import { Errors } from "./errors";
import type { RunRow, UserRow, JoinRequestRow } from "./viewer";

type Db = ReturnType<typeof getDb>;

export async function loadRun(db: Db, runId: string): Promise<RunRow> {
  const [row] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  if (!row) throw Errors.runNotFound();
  return row;
}

export async function loadUser(db: Db, userId: string): Promise<UserRow> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw Errors.runNotFound(); // referenced user must exist; data-integrity 404
  return row;
}

export async function approvedCounts(db: Db, runIds: string[]): Promise<Map<string, number>> {
  if (runIds.length === 0) return new Map();
  const rows = await db
    .select({ runId: joinRequests.runId, count: sql<number>`count(*)` })
    .from(joinRequests)
    .where(and(inArray(joinRequests.runId, runIds), eq(joinRequests.status, "approved")))
    .groupBy(joinRequests.runId);
  return new Map(rows.map((r) => [r.runId, Number(r.count)]));
}

export async function latestViewerRequests(
  db: Db,
  viewerId: string | null,
  runIds: string[],
): Promise<Map<string, JoinRequestRow>> {
  if (!viewerId || runIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(joinRequests)
    .where(and(eq(joinRequests.requesterId, viewerId), inArray(joinRequests.runId, runIds)))
    .orderBy(desc(joinRequests.createdAt));
  const byRun = new Map<string, JoinRequestRow>();
  for (const r of rows) if (!byRun.has(r.runId)) byRun.set(r.runId, r); // first = most recent
  return byRun;
}

/** Draft visibility (host-only, else 404) and private-run access (§7 Open
 *  Q4's stated default: unlisted but link-accessible — no extra gate). */
export function assertRunVisible(run: RunRow, viewerId: string | null) {
  if (run.isDraft && run.hostId !== viewerId) throw Errors.runNotFound();
}
