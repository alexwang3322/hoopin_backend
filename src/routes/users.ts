import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Env, AppVariables } from "../types";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import { Errors } from "../lib/errors";
import { toUserSummary } from "../lib/viewer";

export const usersRoute = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// GET /users/:userId — public profile, optional auth
usersRoute.get("/:userId", async (c) => {
  const db = getDb(c.env);
  const [row] = await db.select().from(users).where(eq(users.id, c.req.param("userId"))).limit(1);
  if (!row) throw Errors.userNotFound();
  return c.json(toUserSummary(row));
});
