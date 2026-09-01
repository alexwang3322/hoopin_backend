import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { getDb } from "../db/client";
import { users, runs, joinRequests } from "../db/schema";
import { buildSeedUsers, buildSeedRuns, buildSeedJoinRequests } from "../db/seedData";

/**
 * Dev-only utility routes — NOT part of API_CONTRACT.md, deliberately kept
 * off the /v1 prefix so they're never mistaken for a real endpoint. Every
 * handler checks DEV_AUTH itself (not just at mount time) and 404s as if
 * the route doesn't exist when it's off, so this can never accidentally
 * serve in an environment with real auth wired in.
 */
export const devRoute = new Hono<{ Bindings: Env; Variables: AppVariables }>();

devRoute.post("/seed", async (c) => {
  if (c.env.DEV_AUTH !== "true") return c.notFound();
  const db = getDb(c.env);

  await db.delete(joinRequests);
  await db.delete(runs);
  await db.delete(users);

  // Inserted one row at a time (not a single batched multi-row INSERT) —
  // D1's per-statement bound-variable limit is easy to exceed once a table
  // has enough columns times rows.
  for (const row of buildSeedUsers()) await db.insert(users).values(row);
  for (const row of buildSeedRuns()) await db.insert(runs).values(row);
  for (const row of buildSeedJoinRequests()) await db.insert(joinRequests).values(row);

  return c.json({ ok: true, seeded: true });
});
