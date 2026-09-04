import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, AppVariables } from "./types";
import { resolveViewer } from "./lib/auth";
import { ApiError } from "./lib/errors";
import { runsRoute } from "./routes/runs";
import { requestsRoute } from "./routes/requests";
import { meRoute } from "./routes/me";
import { usersRoute } from "./routes/users";
import { devRoute } from "./routes/dev";
import { webhooksRoute } from "./routes/webhooks";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// Registered first so it wraps the whole pipeline, including auth failures
// thrown by resolveViewer below — those resolve via app.onError rather than
// rejecting, so this still runs and sees the final status.
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  console.log(
    JSON.stringify({
      event: "request",
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      viewerId: c.get("viewerId") ?? null,
      ms: Date.now() - start,
    }),
  );
});

app.use("*", cors({ origin: "*", allowHeaders: ["Authorization", "Content-Type"] }));
app.use("*", resolveViewer);

app.get("/", (c) => c.json({ name: "hoopin-backend", ok: true }));

const v1 = new Hono<{ Bindings: Env; Variables: AppVariables }>();
v1.route("/runs", runsRoute);
v1.route("/runs/:runId/requests", requestsRoute);
v1.route("/me", meRoute);
v1.route("/users", usersRoute);
app.route("/v1", v1);
app.route("/dev", devRoute);
app.route("/webhooks", webhooksRoute);

app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "No such route." } }, 404));

app.onError((err, c) => {
  if (err instanceof ApiError) return err.toResponse(c);
  console.error(err);
  return c.json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } }, 500);
});

export default app;
