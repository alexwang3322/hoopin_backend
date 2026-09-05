# Hoopin — Backend

Implements `../API_CONTRACT.md` on Cloudflare Workers ("Plan A" from the architecture discussion): [Hono](https://hono.dev) + [Drizzle ORM](https://orm.drizzle.team) + [D1](https://developers.cloudflare.com/d1/).

## Status

All of §3's endpoints are implemented and enforce §6's business rules server-side (capacity checks on both `approve` and the auto-approve create path, `exact_address`/`pending_requests` viewer-gating, draft-hiding, cursor pagination). **Auth is real** — Clerk-issued session JWTs, verified server-side and deployed to production (`src/lib/auth.ts`) — with a `DEV_AUTH` toggle down to a local-only bearer-token stub for offline testing (see below).

## Running locally — no Cloudflare account needed

Everything below is 100% local: `wrangler dev` runs the Worker locally, and D1 is simulated as a local SQLite file under `.wrangler/state/`. No login, no deploy, no website setup.

```bash
npm install
npx drizzle-kit generate            # already run once — re-run after editing src/db/schema.ts
npm run db:migrate:local            # applies migrations/*.sql to local D1
npm run dev                         # starts the Worker on http://localhost:8787

# in a second terminal, once `npm run dev` is running:
npm run db:seed:local               # wipes + reseeds local D1 with fixture data
npm run db:clear:local              # empties local D1 (no reseed)
```

The seed data (`src/db/seedData.ts`) reuses the same user/run ids as `frontend/src/mock/{profiles,runs}.ts` (Jamie Tran hosting Kezar Pavilion, etc.) so manual testing lines up with what the frontend/mobile mocks already demonstrate — plus a private run and a draft to exercise those code paths.

### Auth in local dev

`API_CONTRACT.md` §5 only fixes the transport (`Authorization: Bearer <token>`) — issuance is explicitly out of scope. Until a real issuer is wired in (see below), `DEV_AUTH=true` (set in `wrangler.jsonc`) accepts tokens shaped `Bearer dev:<userId>`, where `<userId>` is any id from the seed data:

```bash
curl http://localhost:8787/v1/runs/ev_kezar_lunch \
  -H "Authorization: Bearer dev:u_jamie"
```

This is a **local-dev-only stub** (`src/lib/auth.ts`) — it must never run with real traffic. `DEV_AUTH=false` makes every bearer token fail closed with a loud error until real JWT verification is implemented in `verifyRealToken`.

### Dev-only seed/clear routes

`POST /dev/seed` and `POST /dev/clear` (not under `/v1`, not part of the contract) live in `src/routes/dev.ts`. Both self-guard on `DEV_AUTH === "true"` and 404 otherwise, so they can never accidentally serve outside local dev.

- `/dev/seed` empties every table (row deletes, not `DROP TABLE` — schema stays intact) and reinserts fixture data.
- `/dev/clear` runs the same row deletes but skips the reseed, leaving all tables empty. Handy when you want a clean slate without the fixture data coming back.

Both share a `clearAllTables` helper that deletes in FK-safe order (`join_requests` → `runs` → `users`). Trigger either from a second terminal via the npm scripts above, or directly: `curl -X POST http://localhost:8787/dev/clear`.

## Deploying for real (needs a Cloudflare account)

Not done by this scaffold — see the repo root `CLAUDE.md` and the architecture discussion for the full picture. Short version:

1. `wrangler login` (or reuse the `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` already used by `frontend/`'s deploy).
2. `wrangler d1 create hoopin-db` — replace the placeholder `database_id` in `wrangler.jsonc` with the real one it prints.
3. `npm run db:migrate:remote`.
4. Create a Clerk app (or reuse the existing one — see `frontend/ClerkPrompt.md`) and set its secret key and a webhook signing secret as Worker secrets: `wrangler secret put CLERK_SECRET_KEY` / `wrangler secret put CLERK_WEBHOOK_SIGNING_SECRET` (never in `wrangler.jsonc`). `DEV_AUTH` is already `"false"` there, committed.
5. `npm run deploy`, then register `<deployed-url>/webhooks/clerk` as a webhook endpoint in the Clerk Dashboard, subscribed to `user.created`/`user.updated`/`user.deleted`.

## Architecture

- `src/contract-types.ts` — hand-mirrors `API_CONTRACT.md` §2's TypeScript types verbatim. This is the actual runtime source of truth once a client is wired up — keep it and the contract doc in sync in the same change.
- `src/db/schema.ts` — Drizzle schema for `users`/`runs`/`join_requests`. `going_count` is never stored — always derived from `join_requests` at read time, so it can't drift.
- `src/lib/viewer.ts` — the viewer-scoped serialization layer: the 7-branch `ViewerAction` state machine, `exact_address`/`pending_requests` gating (as truly-absent keys, not nulls), server-computed `initials`, and hash-derived `cover_seed`/avatar color (no stored images, per contract §6).
- `src/lib/loaders.ts` — shared DB loaders (run/user lookups, approved-count aggregation, draft/private visibility) reused across route files.
- `src/lib/time.ts` — combines `date`+`time`+`timezone` into a `ZonedDateTimeString` with the *correct* UTC offset via `Intl.DateTimeFormat`, never a hardcoded offset.
- `src/routes/*.ts` — one file per §1 resource group (`runs`, `requests`, `me`, `users`), plus `dev.ts` for the local-only seed/clear routes.
- `src/index.ts` — wires it all together: CORS, the auth-resolving middleware, `/v1` mounting, and a global error handler that maps `ApiError` (`src/lib/errors.ts`) to §4's exact response shape.

## Known open items (see `../API_CONTRACT.md` §7)

- **Private-run access** (Open Q4/Q6): implemented as the contract's stated default — unlisted (excluded from `GET /runs`), but viewable by anyone with the run id/URL, no extra 403 gate. Revisit if product wants real invite-token gating instead.
- **Withdraw vs. back-out** (Open Q1): both map to a single `withdrawn` status, per the contract's default.
- **`PATCH /runs/{id}` capacity edits** (Open Q5): rejects `capacity < going_count`; otherwise unrestricted (not scoped to draft-only).
