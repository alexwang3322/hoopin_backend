import { eq } from "drizzle-orm";
import { runs } from "../db/schema";
import type { Db } from "../db/client";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ZONED_DATETIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})([+-]\d{2}:\d{2}|Z)$/;

/**
 * Weekly upkeep for seed/demo data: `runs.startsAt`/`endsAt` are fixed
 * ZonedDateTimeStrings (lib/time.ts) that otherwise age into the past and
 * make the app look dead. Any run whose `startsAt` has already passed gets
 * both timestamps shifted forward by whole weeks — one 7-day shift at a
 * time, repeated as many times as needed — until `startsAt` is current
 * again, so a run stays correct even if a scheduled run is missed for a
 * while rather than only catching up by one week per invocation.
 *
 * Loads the whole table rather than filtering in SQL: `startsAt` strings
 * carry their own UTC offset (e.g. "-07:00" vs. "Z"), so lexicographic
 * comparison against `now.toISOString()` isn't reliably chronological —
 * real `Date` comparison is. The `runs` table is small (seed/demo data),
 * so a full scan here is cheap.
 */
export async function refreshOutdatedRunDates(db: Db, now: Date = new Date()): Promise<number> {
  const all = await db.select().from(runs);

  let updated = 0;
  for (const run of all) {
    const startsAt = new Date(run.startsAt);
    if (startsAt >= now) continue;

    const weeksBehind = Math.floor((now.getTime() - startsAt.getTime()) / WEEK_MS) + 1;

    await db
      .update(runs)
      .set({
        startsAt: shiftByWeeks(run.startsAt, weeksBehind),
        endsAt: shiftByWeeks(run.endsAt, weeksBehind),
      })
      .where(eq(runs.id, run.id));
    updated++;
  }

  return updated;
}

// Shifts a ZonedDateTimeString's calendar date forward by whole weeks,
// keeping its local time-of-day and UTC-offset suffix exactly as-is. Pure
// calendar-date arithmetic (never round-trips through an absolute UTC
// instant), so it can't be perturbed by a DST transition landing between
// the old and new date.
function shiftByWeeks(value: string, weeks: number): string {
  const match = value.match(ZONED_DATETIME_PATTERN);
  if (!match) return value;
  const [, date, time, offset] = match;

  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + weeks * 7);
  const newDate = shifted.toISOString().slice(0, 10);

  return `${newDate}T${time}${offset}`;
}
