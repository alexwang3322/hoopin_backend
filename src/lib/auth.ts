import type { Context, Next } from "hono";
import { verifyToken } from "@clerk/backend";
import { Errors } from "./errors";
import type { Env, AppVariables } from "../types";

type Ctx = Context<{ Bindings: Env; Variables: AppVariables }>;

/**
 * Auth issuance is explicitly out of scope in API_CONTRACT.md §5 — only the
 * transport (`Authorization: Bearer <token>`) is fixed. DEV_AUTH=true
 * accepts tokens shaped `Bearer dev:<userId>` where <userId> is a real row
 * in `users`, so local development/testing can exercise every
 * viewer-scoped rule without a Clerk session. DEV_AUTH must be off before
 * this ever serves real traffic — see `verifyRealToken` below, which
 * verifies a real Clerk session JWT. The token's `sub` claim IS the
 * `users.id` — rows are provisioned by routes/webhooks.ts, not here; a
 * valid Clerk token for a user whose webhook hasn't landed yet (or who
 * predates this being wired in) will 401 downstream via requireAuth's
 * callers hitting a missing row, not here.
 */
export async function resolveViewer(c: Ctx, next: Next) {
  const header = c.req.header("Authorization");
  let viewerId: string | null = null;

  if (header?.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length);
    if (c.env.DEV_AUTH === "true") {
      viewerId = await resolveDevToken(c, token);
    } else {
      viewerId = await verifyRealToken(c, token);
    }
  }

  c.set("viewerId", viewerId);
  await next();
}

async function resolveDevToken(c: Ctx, token: string): Promise<string | null> {
  if (!token.startsWith("dev:")) {
    console.warn(JSON.stringify({ event: "auth.dev_token_malformed" }));
    throw Errors.unauthenticated();
  }
  const userId = token.slice("dev:".length);
  const row = await c.env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(userId).first();
  if (!row) {
    console.warn(JSON.stringify({ event: "auth.dev_token_unknown_user", userId }));
    throw Errors.unauthenticated();
  }
  return userId;
}

async function verifyRealToken(c: Ctx, token: string): Promise<string | null> {
  try {
    const payload = await verifyToken(token, { secretKey: c.env.CLERK_SECRET_KEY });
    return payload.sub;
  } catch (err) {
    console.warn(
      JSON.stringify({ event: "auth.clerk_verify_failed", reason: err instanceof Error ? err.message : String(err) }),
    );
    throw Errors.unauthenticated();
  }
}

/** Route guard for endpoints where §3 marks Auth as "Required". */
export function requireAuth(c: Ctx): string {
  const viewerId = c.get("viewerId");
  console.log(JSON.stringify({ event: "viewerId", viewerId }));
  if (!viewerId) throw Errors.unauthenticated();
  return viewerId;
}
