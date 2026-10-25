/**
 * Test that Today page renders a direct link for previous-day open sessions.
 * 
 * When findOpenStrengthSession returns a session with local_date !== today,
 * the page should render a Link to /session/{id} instead of StartSessionButton
 * that calls startSession.
 * 
 *   npx tsx scripts/test-today-previous-day-resume.ts
 */

import { findOpenStrengthSession, previousDayResumeHref, type SessionForDetection } from "../src/lib/today/session-detection";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {

console.log("\n1. findOpenStrengthSession returns yesterday's in_progress session");
{
  const allSessions: SessionForDetection[] = [
    {
      id: "yesterday-session",
      status: "in_progress",
      actual_type: "weights",
      local_date: "2026-10-24",
      started_at: "2026-10-24T23:30:00Z",
    },
    {
      id: "today-planned",
      status: "planned",
      actual_type: "weights",
      local_date: "2026-10-25",
      started_at: null,
    },
  ];

  const todaySessions: SessionForDetection[] = [
    {
      id: "today-planned",
      status: "planned",
      actual_type: "weights",
      local_date: "2026-10-25",
      started_at: null,
    },
  ];

  const result = findOpenStrengthSession(allSessions, todaySessions);

  check("result is defined", result !== undefined);
  check("result is yesterday's session", result?.id === "yesterday-session");
  check("result has local_date", result?.local_date === "2026-10-24");
}

console.log("\n2. findOpenStrengthSession prefers in_progress over planned from today");
{
  const allSessions: SessionForDetection[] = [
    {
      id: "today-in-progress",
      status: "in_progress",
      actual_type: "weights",
      local_date: "2026-10-25",
      started_at: "2026-10-25T10:00:00Z",
    },
    {
      id: "today-planned",
      status: "planned",
      actual_type: "weights",
      local_date: "2026-10-25",
      started_at: null,
    },
  ];

  const todaySessions: SessionForDetection[] = [
    {
      id: "today-in-progress",
      status: "in_progress",
      actual_type: "weights",
      local_date: "2026-10-25",
      started_at: "2026-10-25T10:00:00Z",
    },
    {
      id: "today-planned",
      status: "planned",
      actual_type: "weights",
      local_date: "2026-10-25",
      started_at: null,
    },
  ];

  const result = findOpenStrengthSession(allSessions, todaySessions);

  check("result is today's in_progress", result?.id === "today-in-progress");
  check("result has today's date", result?.local_date === "2026-10-25");
}

console.log("\n3. No open session returns undefined");
{
  const allSessions: SessionForDetection[] = [
    {
      id: "completed",
      status: "completed",
      actual_type: "weights",
      local_date: "2026-10-25",
      started_at: "2026-10-25T10:00:00Z",
    },
  ];

  const todaySessions: SessionForDetection[] = [
    {
      id: "completed",
      status: "completed",
      actual_type: "weights",
      local_date: "2026-10-25",
      started_at: "2026-10-25T10:00:00Z",
    },
  ];

  const result = findOpenStrengthSession(allSessions, todaySessions);

  check("result is undefined", result === undefined);
}

console.log("\n4. previousDayResumeHref: previous-day session returns href");
{
  const localToday = "2026-10-25";
  const strengthOpen: SessionForDetection = {
    id: "yesterday-session",
    status: "in_progress",
    actual_type: "weights",
    local_date: "2026-10-24",
    started_at: "2026-10-24T23:30:00Z",
  };

  const result = previousDayResumeHref(strengthOpen, localToday);
  check("returns correct href for previous-day session", result === "/session/yesterday-session");
}

console.log("\n5. previousDayResumeHref: same-day session returns null");
{
  const localToday = "2026-10-25";
  const strengthOpen: SessionForDetection = {
    id: "today-session",
    status: "in_progress",
    actual_type: "weights",
    local_date: "2026-10-25",
    started_at: "2026-10-25T10:00:00Z",
  };

  const result = previousDayResumeHref(strengthOpen, localToday);
  check("returns null for same-day session", result === null);
}

console.log("\n6. previousDayResumeHref: undefined strengthOpen returns null");
{
  const localToday = "2026-10-25";
  const result = previousDayResumeHref(undefined, localToday);
  check("returns null for undefined strengthOpen", result === null);
}

console.log("\n7. previousDayResumeHref: session without id returns null");
{
  const localToday = "2026-10-25";
  const strengthOpen: SessionForDetection = {
    status: "in_progress",
    actual_type: "weights",
    local_date: "2026-10-24",
    started_at: "2026-10-24T23:30:00Z",
  };

  const result = previousDayResumeHref(strengthOpen, localToday);
  check("returns null for session without id", result === null);
}

console.log("\n8. previousDayResumeHref: session without local_date returns null");
{
  const localToday = "2026-10-25";
  const strengthOpen: SessionForDetection = {
    id: "session-no-date",
    status: "in_progress",
    actual_type: "weights",
    started_at: "2026-10-24T23:30:00Z",
  };

  const result = previousDayResumeHref(strengthOpen, localToday);
  check("returns null for session without local_date", result === null);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

})();

export {};
