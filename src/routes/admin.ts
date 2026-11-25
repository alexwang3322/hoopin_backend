import { Hono } from "hono";
import type { Env, AppVariables } from "../types";
import { getDb } from "../db/client";
import { refreshOutdatedRunDates } from "../lib/refreshDates";
import { Errors } from "../lib/errors";

export const adminRoute = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Keep the bookmarked Worker URL useful while the UI uses the site's existing
// Clerk session to obtain a bearer token. Visiting this URL never writes data.
adminRoute.get("/refresh-seed-dates", (c) =>
  c.redirect("https://hoopin.org/admin/refresh-seed-dates", 302),
);

adminRoute.post("/refresh-seed-dates", async (c) => {
  const adminId = c.env.SEED_REFRESH_ADMIN_USER_ID;
  if (!adminId) return c.notFound();

  const viewerId = c.get("viewerId");
  if (!viewerId) throw Errors.unauthenticated();
  if (viewerId !== adminId) {
    return c.json({ error: { code: "FORBIDDEN", message: "Only the configured administrator can refresh demo dates." } }, 403);
  }

  const updated = await refreshOutdatedRunDates(getDb(c.env));
  console.log(JSON.stringify({ event: "manual_refresh_dates", viewerId, updated }));
  return c.json({ ok: true, updated });
});
