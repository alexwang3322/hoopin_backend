import type { Context, Next } from "hono";
import { Errors } from "./errors";
import type { Env, AppVariables } from "../types";

type Ctx = Context<{ Bindings: Env; Variables: AppVariables }>;

/**
 * Auth issuance is explicitly out of scope in API_CONTRACT.md §5 — only the
 * transport (`Authorization: Bearer <token>`) is fixed. Until a real issuer
 * (Clerk, per backend/README.md) is wired in, DEV_AUTH=true accepts tokens
 * shaped `Bearer dev:<userId>` where <userId> is a real row in `users`, so
 * local development/testing can exercise every viewer-scoped rule without a
 * third-party account. DEV_AUTH must be off before this ever serves real
 * traffic — see the `verifyRealToken` stub below.
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
  if (!token.startsWith("dev:")) throw Errors.unauthenticated();
  const userId = token.slice("dev:".length);
  const row = await c.env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(userId).first();
  if (!row) throw Errors.unauthenticated();
  return userId;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function verifyRealToken(c: Ctx, token: string): Promise<string | null> {
  throw new Error(
    "DEV_AUTH is off but no real token verification is implemented yet. " +
      "Wire Clerk JWT verification here (CLERK_JWKS_URL/.dev.vars) before disabling DEV_AUTH.",
  );
}

/** Route guard for endpoints where §3 marks Auth as "Required". */
export function requireAuth(c: Ctx): string {
  const viewerId = c.get("viewerId");
  if (!viewerId) throw Errors.unauthenticated();
  return viewerId;
}
