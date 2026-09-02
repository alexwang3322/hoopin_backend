import { Hono } from "hono";
import { Webhook } from "svix";
import { eq } from "drizzle-orm";
import type { Env, AppVariables } from "../types";
import { getDb } from "../db/client";
import { users } from "../db/schema";

/**
 * Clerk is the identity source of truth — this is the only place `users`
 * rows get created/updated/removed (see db/schema.ts's note on `id`).
 * Deliberately off the /v1 prefix, like routes/dev.ts, since it's not part
 * of API_CONTRACT.md. Configure this URL as an endpoint in the Clerk
 * Dashboard (Webhooks) subscribed to user.created/user.updated/user.deleted.
 */
export const webhooksRoute = new Hono<{ Bindings: Env; Variables: AppVariables }>();

interface ClerkUserEvent {
  type: string;
  data: {
    id: string;
    email_addresses?: { id: string; email_address: string }[];
    primary_email_address_id?: string | null;
    phone_numbers?: { id: string; phone_number: string }[];
    primary_phone_number_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
  };
}

webhooksRoute.post("/clerk", async (c) => {
  // svix verifies against the raw body bytes — must read as text, not json,
  // before any parsing.
  const payload = await c.req.text();
  const svixHeaders = {
    "svix-id": c.req.header("svix-id") ?? "",
    "svix-timestamp": c.req.header("svix-timestamp") ?? "",
    "svix-signature": c.req.header("svix-signature") ?? "",
  };

  let event: ClerkUserEvent;
  try {
    const wh = new Webhook(c.env.CLERK_WEBHOOK_SIGNING_SECRET);
    event = wh.verify(payload, svixHeaders) as unknown as ClerkUserEvent;
  } catch {
    return c.json({ error: "Invalid webhook signature." }, 400);
  }

  const db = getDb(c.env);

  if (event.type === "user.created" || event.type === "user.updated") {
    const d = event.data;
    const email = d.email_addresses?.find((e) => e.id === d.primary_email_address_id)?.email_address ?? null;
    const phone = d.phone_numbers?.find((p) => p.id === d.primary_phone_number_id)?.phone_number ?? null;
    const name = [d.first_name, d.last_name].filter(Boolean).join(" ") || d.username || "Player";

    await db
      .insert(users)
      .values({ id: d.id, email, phone, name, bio: null, createdAt: new Date().toISOString() })
      .onConflictDoUpdate({ target: users.id, set: { email, phone, name } });
  }

  if (event.type === "user.deleted") {
    // Best-effort: a user who hosts runs or has join_requests can't be hard
    // deleted under the FK constraints as-is (no cascade defined for
    // users, unlike join_requests -> runs). Account-deletion semantics
    // (reassign/cancel their runs, etc.) are out of scope here — swallow
    // rather than 500, since Clerk retries webhooks on non-2xx and a
    // permanent FK conflict would retry forever.
    try {
      await db.delete(users).where(eq(users.id, event.data.id));
    } catch (err) {
      console.error("user.deleted webhook: could not delete user row", event.data.id, err);
    }
  }

  return c.json({ ok: true });
});
