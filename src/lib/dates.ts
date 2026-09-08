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
