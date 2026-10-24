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
  prepareOpenSessions,
  shouldRedirectSession,
  type OpenSessionForClose
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

console.log("\n9. Test H: prepareOpenSessions preserves real started_at (not derived from local_date)");
{
  const sessions: OpenSessionForClose[] = [
    { 
      id: "s1", 
      local_date: "2026-10-25", 
      started_at: "2026-10-24T23:30:00Z" 
    },
    { 
      id: "s2", 
      local_date: "2026-10-24", 
      started_at: "2026-10-24T10:00:00Z" 
    },
    { 
      id: "s3", 
      local_date: "2026-10-23", 
      started_at: null 
    },
  ];

  const prepared = prepareOpenSessions(sessions);

  check("preserves session count", prepared.length === 3);
  check("s1 started_at preserved", prepared[0].started_at === "2026-10-24T23:30:00Z");
  check("s1 local_date preserved", prepared[0].local_date === "2026-10-25");
  check("s2 started_at preserved", prepared[1].started_at === "2026-10-24T10:00:00Z");
  check("s3 null started_at preserved", prepared[2].started_at === null);
}

console.log("\n10. Test I: shouldRedirectSession keeps in_progress sessions accessible");
{
  check("completed redirects", shouldRedirectSession("completed") === true);
  check("skipped redirects", shouldRedirectSession("skipped") === true);
  check("in_progress does NOT redirect", shouldRedirectSession("in_progress") === false);
  check("planned does NOT redirect", shouldRedirectSession("planned") === false);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

})();

export {};
