/**
 * Combines a local `date` + `time` + IANA `timezone` (as CreateRunRequest
 * takes them, API_CONTRACT.md §6) into a ZonedDateTimeString with the
 * *correct* UTC offset for that zone — never a hardcoded offset. Uses
 * `Intl.DateTimeFormat`'s `longOffset` to read the real offset instead of a
 * date-library dependency.
 *
 * Known limitation: the offset is computed from the wall-clock time treated
 * as a UTC instant (a same-day approximation), which is correct except
 * inside the ~1-2 hour window of a DST transition itself on the transition
 * day — acceptable for run-scheduling purposes; revisit with a proper
 * zoned-datetime library (e.g. Temporal, once broadly available) if that
 * ever matters.
 */
export function zonedDateTimeString(date: string, time: string, timeZone: string): string {
  const offset = offsetStringFor(date, time, timeZone);
  return `${date}T${time}:00${offset}`;
}

/** Throws if `timeZone` isn't a real IANA zone name. */
export function assertValidTimeZone(timeZone: string): void {
  offsetStringFor("2026-01-01", "00:00", timeZone);
}

function offsetStringFor(date: string, time: string, timeZone: string): string {
  const approxInstant = Date.parse(`${date}T${time}:00Z`);
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset", hour: "2-digit" });
  const parts = dtf.formatToParts(new Date(approxInstant));
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = tzName.match(/GMT([+-]\d{2}:\d{2})?/);
  return match?.[1] ?? "+00:00";
}
