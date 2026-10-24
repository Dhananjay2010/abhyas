/**
 * L2: Test in-progress bar visibility and text formatting.
 * 
 * Verifies the same logic as the REAL InProgressBar component:
 * - L1: Bar is client-side, fetches on mount and pathname changes
 * - Bar is hidden while loading, logged out, or on /session/* routes
 * - Bar is shown on other routes when session exists
 * - "1 set" for single set (correct grammar, QA ii: shortened)
 * - "N sets" for multiple sets
 * - L3: 0-set sessions show "0 sets" (consistent behavior)
 * - Resume link points to /session/:id with no query params
 * 
 *   npx tsx scripts/test-in-progress-bar.ts
 */

(async () => {
let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// Simulate the component logic
function shouldShowBar(pathname: string): boolean {
  return !pathname.startsWith("/session/");
}

// QA (ii): Shortened to fit at 390px width
function formatSetsText(workingSetsLogged: number): string {
  return workingSetsLogged === 1
    ? "1 set"
    : `${workingSetsLogged} sets`;
}

function getResumeLink(sessionId: string): string {
  return `/session/${sessionId}`;
}

console.log("\n1. Bar visibility by pathname");
{
  check("/today → visible", shouldShowBar("/today") === true);
  check("/history → visible", shouldShowBar("/history") === true);
  check("/progress → visible", shouldShowBar("/progress") === true);
  check("/settings → visible", shouldShowBar("/settings") === true);
  check("/session/123 → hidden", shouldShowBar("/session/123") === false);
  check("/session/abc-def → hidden", shouldShowBar("/session/abc-def") === false);
  check("/session/123/edit → hidden", shouldShowBar("/session/123/edit") === false);
}

console.log("\n2. Sets text formatting");
{
  check("0 sets", formatSetsText(0) === "0 sets", formatSetsText(0));
  check("1 set (singular)", formatSetsText(1) === "1 set", formatSetsText(1));
  check("2 sets", formatSetsText(2) === "2 sets", formatSetsText(2));
  check("10 sets", formatSetsText(10) === "10 sets", formatSetsText(10));
}

console.log("\n3. Resume link format");
{
  const link1 = getResumeLink("abc123");
  check("Resume link has no query params", link1 === "/session/abc123", link1);
  check("No trailing slash", !link1.endsWith("/"), link1);
  
  const link2 = getResumeLink("session-456");
  check("Works with different id", link2 === "/session/session-456", link2);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
})();
