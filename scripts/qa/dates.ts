/** Reproduces weekInBlock() from today/page.tsx and startSession()'s daysIn. */
function weekInBlock(startedOn: string, timezone: string, now: Date): number {
  const today = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now));
  const start = new Date(`${startedOn}T00:00:00`);
  const days = Math.floor((today.getTime() - start.getTime()) / 86400000);
  return Math.min(4, Math.max(1, Math.floor(days / 7) + 1));
}
/** UTC-safe version using the project's own convention from lib/dates.ts. */
function weekInBlockSafe(startedOn: string, timezone: string, now: Date): number {
  const t = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
  const [ty, tm, td] = t.split("-").map(Number);
  const [sy, sm, sd] = startedOn.split("-").map(Number);
  const days = Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(sy, sm - 1, sd)) / 86400000);
  return Math.min(4, Math.max(1, Math.floor(days / 7) + 1));
}

const started = "2026-09-03";
console.log(`Block started ${started}. Machine TZ = ${Intl.DateTimeFormat().resolvedOptions().timeZone}\n`);
console.log("date        tz                  current  correct");
let bad = 0;
for (const tz of ["Asia/Kolkata", "America/New_York", "America/Los_Angeles", "Europe/London", "Australia/Sydney"]) {
  for (const d of ["2026-09-09", "2026-09-10", "2026-09-16", "2026-09-17", "2026-09-24"]) {
    const now = new Date(`${d}T12:00:00Z`);
    const a = weekInBlock(started, tz, now);
    const b = weekInBlockSafe(started, tz, now);
    if (a !== b) { bad++; console.log(`${d}  ${tz.padEnd(20)} ${String(a).padEnd(8)} ${b}   <-- MISMATCH`); }
  }
}
console.log(bad === 0 ? "\nno mismatches" : `\n${bad} mismatches`);
