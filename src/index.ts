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

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.use("*", cors({ origin: "*", allowHeaders: ["Authorization", "Content-Type"] }));
app.use("*", resolveViewer);

app.get("/", (c) => c.json({ name: "pull-up-backend", ok: true }));

const v1 = new Hono<{ Bindings: Env; Variables: AppVariables }>();
v1.route("/runs", runsRoute);
v1.route("/runs/:runId/requests", requestsRoute);
v1.route("/me", meRoute);
v1.route("/users", usersRoute);
app.route("/v1", v1);
app.route("/dev", devRoute);

app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "No such route." } }, 404));

app.onError((err, c) => {
  if (err instanceof ApiError) return err.toResponse(c);
  console.error(err);
  return c.json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } }, 500);
});

export default app;
