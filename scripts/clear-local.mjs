// Empties the local dev server's D1 database via the dev-only POST /dev/clear
// route (src/routes/dev.ts) — requires `npm run dev` (wrangler dev) already
// running in another terminal, since D1 bindings only exist inside the
// Worker runtime, not in a plain Node script.
const url = process.env.CLEAR_URL ?? "http://localhost:8787/dev/clear";

const res = await fetch(url, { method: "POST" });
if (!res.ok) {
  console.error(`Clear failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
console.log(await res.json());
