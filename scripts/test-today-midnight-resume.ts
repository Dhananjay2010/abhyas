/**
 * Test Today page resume detection after midnight:
 * - strengthOpen finds in_progress session from yesterday
 * - missedYesterday doesn't fire when yesterday's session is still in_progress
 * - Resume button shown, not Start
 * 
 *   npx tsx scripts/test-today-midnight-resume.ts
 */

import { 
  findOpenStrengthSession,
  isYesterdayStillInProgress
} from "../src/lib/today/session-detection";

type SessionRow = {
  id: string;
  status: "in_progress" | "completed" | "planned" | "skipped";
  actual_type: string | null;
  local_date: string;
  started_at: string | null;
};

function isStrength(t: string | null): boolean {
  return t === "weights" || t === "bodyweight";
}

function detectMissedYesterday(
  yesterdaySessions: SessionRow[],
  yesterdayWasTraining: boolean,
): boolean {
  const yesterdayStillInProgress = isYesterdayStillInProgress(yesterdaySessions);
  return (
    yesterdayWasTraining &&
    !yesterdaySessions.some((s) => s.status === "completed" && isStrength(s.actual_type)) &&
    !yesterdayStillInProgress
  );
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {

console.log("\n1. Resume button shown when yesterday's session is still in_progress");
{
  const allSessions: SessionRow[] = [
    { id: "s1", status: "in_progress", actual_type: "weights", local_date: "2026-10-24", started_at: "2026-10-24T23:30:00Z" },
  ];
  const todaySessions: SessionRow[] = [];

  const strengthOpen = findOpenStrengthSession(allSessions, todaySessions);

  check("strengthOpen found", strengthOpen !== undefined);
  check("strengthOpen is yesterday's session", strengthOpen?.id === "s1");
}

console.log("\n2. Start button shown when no in_progress session exists");
{
  const allSessions: SessionRow[] = [];
  const todaySessions: SessionRow[] = [];

  const strengthOpen = findOpenStrengthSession(allSessions, todaySessions);

  check("strengthOpen not found", strengthOpen === undefined);
}

console.log("\n3. Resume button shown for planned session today when no in_progress exists");
{
  const allSessions: SessionRow[] = [
    { id: "s2", status: "planned", actual_type: "weights", local_date: "2026-10-25", started_at: null },
  ];
  const todaySessions: SessionRow[] = [
    { id: "s2", status: "planned", actual_type: "weights", local_date: "2026-10-25", started_at: null },
  ];

  const strengthOpen = findOpenStrengthSession(allSessions, todaySessions);

  check("strengthOpen found planned", strengthOpen !== undefined);
  check("strengthOpen is planned session", strengthOpen?.status === "planned");
}

console.log("\n4. In_progress from yesterday takes precedence over planned today");
{
  const allSessions: SessionRow[] = [
    { id: "s1", status: "in_progress", actual_type: "weights", local_date: "2026-10-24", started_at: "2026-10-24T23:30:00Z" },
    { id: "s2", status: "planned", actual_type: "weights", local_date: "2026-10-25", started_at: null },
  ];
  const todaySessions: SessionRow[] = [
    { id: "s2", status: "planned", actual_type: "weights", local_date: "2026-10-25", started_at: null },
  ];

  const strengthOpen = findOpenStrengthSession(allSessions, todaySessions);

  check("strengthOpen found", strengthOpen !== undefined);
  check("strengthOpen is in_progress (not planned)", strengthOpen?.status === "in_progress");
  check("strengthOpen is from yesterday", strengthOpen?.id === "s1");
}

console.log("\n5. missedYesterday does NOT fire when yesterday's session is still in_progress");
{
  const yesterdaySessions: SessionRow[] = [
    { id: "s1", status: "in_progress", actual_type: "weights", local_date: "2026-10-24", started_at: "2026-10-24T23:30:00Z" },
  ];

  const missed = detectMissedYesterday(yesterdaySessions, true);

  check("missedYesterday is false", missed === false);
}

console.log("\n6. missedYesterday fires when yesterday was training and not completed");
{
  const yesterdaySessions: SessionRow[] = [
    { id: "s1", status: "skipped", actual_type: "weights", local_date: "2026-10-24", started_at: "2026-10-24T14:00:00Z" },
  ];

  const missed = detectMissedYesterday(yesterdaySessions, true);

  check("missedYesterday is true", missed === true);
}

console.log("\n7. missedYesterday does NOT fire when yesterday was completed");
{
  const yesterdaySessions: SessionRow[] = [
    { id: "s1", status: "completed", actual_type: "weights", local_date: "2026-10-24", started_at: "2026-10-24T14:00:00Z" },
  ];

  const missed = detectMissedYesterday(yesterdaySessions, true);

  check("missedYesterday is false", missed === false);
}

console.log("\n8. missedYesterday does NOT fire when yesterday was rest day");
{
  const yesterdaySessions: SessionRow[] = [];

  const missed = detectMissedYesterday(yesterdaySessions, false);

  check("missedYesterday is false", missed === false);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

})();

export {};
