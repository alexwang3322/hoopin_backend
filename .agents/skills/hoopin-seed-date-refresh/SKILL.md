---
name: hoopin-seed-date-refresh
description: Refresh past-due Hoopin demo run dates in the remote D1 database, or troubleshoot the manual refresh page and weekly cron. Use for Hoopin seed-date refresh requests, not for a full database reseed or importing new data.
---

# Hoopin demo date refresh

This skill applies to the `hoopin_backend` repository and its paired `hoopin_frontend` repository. First establish whether the request is to move existing demo run dates, import new records, or fully reseed. These are different operations. Production `/dev/seed` is disabled and its local implementation deletes and recreates rows; never substitute it for a date refresh.

## Current path

- The bookmarkable Worker URL is `https://hoopin-backend.alex-wang3322.workers.dev/admin/refresh-seed-dates`. GET redirects to the Hoopin page. Opening the URL does not write data.
- On the page, a signed-in Clerk user clicks **Refresh now**. The frontend sends an authenticated POST to the Worker. The Worker permits only the Clerk user ID configured in its `SEED_REFRESH_ADMIN_USER_ID` runtime secret and returns `{ ok: true, updated: number }`.
- The refresh implementation is `src/lib/refreshDates.ts`, also called by the weekly `scheduled` handler in `src/index.ts`. It moves only past-due runs whose IDs start with `ev_` forward by whole weeks. It should leave other runs and user records alone.

## Perform and verify

1. Inspect `src/routes/admin.ts`, `src/lib/refreshDates.ts`, `src/index.ts`, and the deployed environment before acting. Confirm the route still checks a verified Clerk identity and that the production secret is configured for the intended account. Do not put a credential or user ID in the URL.
2. If the user authorized a refresh, open the URL, sign in to Hoopin if needed, click **Refresh now** once, and record the returned count. A Clerk dashboard login does not necessarily sign in to the Hoopin site. Do not bypass a browser security checkpoint.
3. Verify the response and, when access is available, query D1 for overdue `ev_` runs and sample non-`ev_` runs. An `updated: 0` response can be correct if the weekly cron already refreshed the dates. Do not repeat the POST just to obtain a nonzero count.
4. Report the live result, including any sign-in, deployment, or permission blocker. Treat a committed change or an HTTP redirect as incomplete verification of a database refresh.

## If the URL is unavailable

Check the frontend deployment, Worker deployment, and Cloudflare runtime variables. The frontend page lives in the paired repository at `src/pages/Admin/RefreshSeedDatesPage.tsx` and is mounted from `src/App.tsx`. The backend POST returns 404 when `SEED_REFRESH_ADMIN_USER_ID` is absent, 401 for a missing or invalid token, and 403 for another signed-in user. Setting or changing that secret grants database write access to an account; obtain the required approval for that access change before applying it. Keep secret values out of source files, command output, and URLs.

If the user instead requests new seed records or a full reseed, inspect the existing seed code and production data dependencies, then plan that operation separately. Do not run `/dev/seed` against the remote database.
