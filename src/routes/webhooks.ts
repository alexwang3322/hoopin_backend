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
  };
}

// Every new sign-up starts as this generic persona rather than pulling
// Clerk's real name into the app — name/bio are app-owned profile fields
// the user edits in-app, not synced from Clerk's identity data.
const DEFAULT_NAME = "Hooper";
const DEFAULT_BIO = "I am the captain of my soul, I am the master of my fate.";

webhooksRoute.post("/clerk", async (c) => {
  // svix verifies against the raw body bytes — must read as text, not json,
  // before any parsing.
  const payload = await c.req.text();
  const svixHeaders = {
    "svix-id": c.req.header("svix-id") ?? "",
    "svix-timestamp": c.req.header("svix-timestamp") ?? "",
    "svix-signature": c.req.header("svix-signature") ?? "",
  };

  // This version of the `svix` package's Webhook.verify() only checks the
  // signature (throwing on failure) — it does NOT return the parsed
  // payload, unlike some other svix SDKs/versions. Parse it ourselves.
  let event: ClerkUserEvent;
  try {
    const wh = new Webhook(c.env.CLERK_WEBHOOK_SIGNING_SECRET);
    wh.verify(payload, svixHeaders);
    event = JSON.parse(payload) as ClerkUserEvent;
  } catch {
    return c.json({ error: "Invalid webhook signature." }, 400);
  }

  const db = getDb(c.env);

  if (event.type === "user.created" || event.type === "user.updated") {
    const d = event.data;
    const email = d.email_addresses?.find((e) => e.id === d.primary_email_address_id)?.email_address ?? null;
    const phone = d.phone_numbers?.find((p) => p.id === d.primary_phone_number_id)?.phone_number ?? null;

    // email/phone are identity fields Clerk owns, so they stay synced on
    // every event. name/bio are only set on first creation (the generic
    // default above) and never touched again here — once account editing
    // is wired up, a user's own edits must survive a later Clerk sync.
    await db
      .insert(users)
      .values({ id: d.id, email, phone, name: DEFAULT_NAME, bio: DEFAULT_BIO, createdAt: new Date().toISOString() })
      .onConflictDoUpdate({ target: users.id, set: { email, phone } });
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
