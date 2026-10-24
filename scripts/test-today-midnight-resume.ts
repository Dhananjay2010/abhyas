/**
 * Test Today page helpers: session detection, close-stale input, banner text.
 * - findOpenStrengthSession finds in_progress or planned strength sessions
 * - todayCloseInput preserves real started_at for close-stale
 * - creditedBannerText formats banner messages
 * 
 *   npx tsx scripts/test-today-midnight-resume.ts
 */

import { 
  findOpenStrengthSession,
  todayCloseInput,
  creditedBannerText,
  shouldRedirectSession,
  prepareTodayPageData
} from "../src/lib/today/session-detection";

type SessionRow = {
  id: string;
  status: "in_progress" | "completed" | "planned" | "skipped";
  actual_type: string | null;
  local_date: string;
  started_at: string | null;
};

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

console.log("\n10. Test I: shouldRedirectSession keeps in_progress sessions accessible");
{
  check("completed redirects", shouldRedirectSession("completed") === true);
  check("skipped does NOT redirect", shouldRedirectSession("skipped") === false);
  check("in_progress does NOT redirect", shouldRedirectSession("in_progress") === false);
  check("planned does NOT redirect", shouldRedirectSession("planned") === false);
}

console.log("\n11. todayCloseInput preserves started_at for close-stale");
{
  const rawRows = [
    { id: "s1", local_date: "2026-10-25", started_at: "2026-10-24T23:30:00Z", actual_type: "weights", status: "in_progress" },
    { id: "s2", local_date: "2026-10-24", started_at: null, actual_type: "bodyweight", status: "in_progress" },
  ];

  const input = todayCloseInput(rawRows);

  check("returns correct count", input.length === 2);
  check("s1 id preserved", input[0].id === "s1");
  check("s1 started_at preserved", input[0].started_at === "2026-10-24T23:30:00Z");
  check("s1 local_date preserved", input[0].local_date === "2026-10-25");
  check("s2 null started_at preserved", input[1].started_at === null);
  check("handles null input", todayCloseInput(null).length === 0);
}

console.log("\n12. creditedBannerText generates correct message for Today page");
{
  check("0 credited returns null", creditedBannerText(0) === null);
  check("1 credited returns singular", creditedBannerText(1) === "A session you had left open has been counted — you had logged sets in it.");
  check("2 credited returns plural", creditedBannerText(2) === "2 sessions you had left open have been counted — you had logged sets in them.");
  check("5 credited returns plural", creditedBannerText(5)?.startsWith("5 sessions") === true);
}

console.log("\n13. prepareTodayPageData: page wiring for c2, e1, f2");
{
  // c2: credited banner uses the real credited count (2)
  // e1: resume finder receives all sessions (including yesterday's in_progress)
  // f2: close-stale receives real started_at (not derived from local_date)
  
  const openSessions = [
    { id: "open1", local_date: "2026-10-24", started_at: "2026-10-24T10:00:00Z", actual_type: "weights", status: "in_progress" },
    { id: "open2", local_date: "2026-10-25", started_at: null, actual_type: "bodyweight", status: "in_progress" },
  ];
  
  const allSessions: SessionRow[] = [
    { id: "yesterday", status: "in_progress", actual_type: "weights", local_date: "2026-10-24", started_at: "2026-10-24T23:30:00Z" },
    { id: "today", status: "planned", actual_type: "bodyweight", local_date: "2026-10-25", started_at: null },
  ];
  
  const todaySessions: SessionRow[] = [
    { id: "today", status: "planned", actual_type: "bodyweight", local_date: "2026-10-25", started_at: null },
  ];
  
  const creditedCount = 2;
  
  const pageData = prepareTodayPageData(openSessions, allSessions, todaySessions, creditedCount);
  
  // f2: close-stale input preserves real started_at
  check("closeStaleInput has 2 sessions", pageData.closeStaleInput.length === 2);
  check("f2: real started_at preserved (not null)", pageData.closeStaleInput[0].started_at === "2026-10-24T10:00:00Z");
  check("f2: null started_at preserved", pageData.closeStaleInput[1].started_at === null);
  
  // e1: strengthOpen uses allSessions (finds yesterday's in_progress)
  check("e1: strengthOpen found", pageData.strengthOpen !== undefined);
  check("e1: strengthOpen is yesterday's in_progress", pageData.strengthOpen?.id === "yesterday");
  
  // c2: creditedBanner uses the real count (2)
  check("c2: creditedBanner is not null", pageData.creditedBanner !== null);
  check("c2: creditedBanner shows 2 sessions", pageData.creditedBanner?.startsWith("2 sessions") === true);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

})();

export {};
