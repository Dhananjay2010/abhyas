/**
 * Calendar-date helpers.
 *
 * Abhyas stores day-wise data keyed on the user's LOCAL date, so every date
 * string must be produced in their timezone. The trap:
 *
 *     new Date("2026-08-30T00:00:00").toISOString().slice(0, 10)
 *
 * parses as local midnight but formats as UTC, which in IST (UTC+5:30) rolls
 * the answer back to 2026-08-29. Nothing here converts between the two: the
 * user's date comes from Intl with an explicit timeZone, and arithmetic stays
 * inside UTC so it cannot drift.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** Today (or `at`) as yyyy-mm-dd in the given IANA timezone. */
export function localDateString(timezone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(at);
}

/** Shift a yyyy-mm-dd string by whole days. Construction and reading are both UTC. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/**
 * Whole days from `from` to `to`, both yyyy-mm-dd. Negative when `to` is earlier.
 *
 * Both sides are read as UTC, so the result is a plain difference of calendar
 * days with no timezone in it. The trap this exists to avoid is the one at the
 * top of this file: `new Date("2026-09-10")` is UTC midnight while
 * `new Date("2026-09-10T00:00:00")` is *local* midnight, so subtracting one
 * from the other silently mixes two clocks and shifts the answer by the
 * server's offset. Two callers did exactly that.
 */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** Every date from `from` to `to`, inclusive. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = from;
  // Guard against a reversed range rather than looping forever.
  for (let i = 0; cursor <= to && i < 3650; i++) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** Monday-based ISO weekday, 1..7. */
export function isoWeekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return ((dow + 6) % 7) + 1;
}

/** Parse an ISO 8601 timestamp to milliseconds since epoch. */
export function parseIsoMs(iso: string): number {
  return Date.parse(iso);
}

/** Calculate seconds elapsed from an ISO timestamp to a reference time in milliseconds. */
export function secondsSinceIso(iso: string, nowMs: number): number {
  return (nowMs - parseIsoMs(iso)) / 1000;
}

/** Convert milliseconds since epoch to an ISO 8601 timestamp. */
export function isoFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

/** Get the current local hour (0-23) in the given IANA timezone. */
export function localHour(timezone: string, at: Date = new Date()): number {
  const hourString = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  }).format(at);
  return parseInt(hourString, 10);
}
