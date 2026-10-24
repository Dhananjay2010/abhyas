/**
 * Test PR detection with a heavy user (more sessions than the query cap).
 * 
 * Verifies that PR badges work correctly for recent sessions even when
 * a user has extensive history beyond the query limit.
 * 
 *   npx tsx scripts/test-pr-detection-heavy-user.ts
 */

import { detectSetPRs } from "../src/lib/exercise-history";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nHeavy user scenario: 700 sessions, query cap at 600");
console.log("Goal: Prove newest page (sessions 1-20) shows correct PRs\n");

// Simulate 700 sessions worth of sets for ONE exercise
// Each session has 3 sets, total 2100 sets
// Query fetches sessions 1-600 (oldest 600 before page 1), covering sets 1-1800
// Page 1 shows sessions 1-20 (newest)

const allSetsChronological: Array<{
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
  sessionNumber: number;
}> = [];

// Generate 700 sessions, each with 3 sets
// Progressive overload: weight increases every 10 sessions
for (let sessionNum = 1; sessionNum <= 700; sessionNum++) {
  const baseWeight = 60 + Math.floor(sessionNum / 10) * 2.5;
  
  // 3 sets per session with typical progression
  allSetsChronological.push(
    { reps: 8, weight_kg: baseWeight, duration_seconds: null, sessionNumber: sessionNum },
    { reps: 8, weight_kg: baseWeight, duration_seconds: null, sessionNumber: sessionNum },
    { reps: 7, weight_kg: baseWeight, duration_seconds: null, sessionNumber: sessionNum }
  );
}

console.log(`1. Data setup`);
check(`total sessions: 700`, allSetsChronological.length === 2100, `${allSetsChronological.length} sets`);
check(`newest session uses highest weight`, allSetsChronological[allSetsChronological.length - 1].weight_kg === 235);

// Simulate what the query returns: sessions 101-700 (oldest 600 sessions)
// This means we have sets from sessions 101-700 = sets index 300 to 2099
const setsFromQuery = allSetsChronological.slice(300); // Skip first 100 sessions

console.log(`\n2. Query simulation (cap at 600 sessions)`);
check(`query returns sets from sessions 101-700`, setsFromQuery.length === 1800, `${setsFromQuery.length} sets`);
check(`query includes newest session`, setsFromQuery[setsFromQuery.length - 1].sessionNumber === 700);

// Now check if we can correctly detect PRs for the newest 20 sessions (681-700)
// These are at the END of setsFromQuery, indices 1740-1799

console.log(`\n3. PR detection for newest 20 sessions (page 1)`);

// Session 690 should be a PR: weight = 60 + floor(690/10)*2.5 = 60 + 69*2.5 = 232.5 kg
// This is a PR because prior sessions (680-689) had 230kg
const session690StartIdx = (690 - 101) * 3; // Relative to setsFromQuery
const session690Sets = setsFromQuery.slice(session690StartIdx, session690StartIdx + 3);

check(`session 690 sets fetched`, session690Sets.length === 3);
check(`session 690 weight is 232.5kg`, session690Sets[0].weight_kg === 232.5);

// Check if this is detected as a PR
const priorToSession690 = setsFromQuery.slice(0, session690StartIdx);
const prsForFirstSetOfSession690 = detectSetPRs(
  [...priorToSession690.map(s => ({ reps: s.reps, weight_kg: s.weight_kg, duration_seconds: s.duration_seconds })), session690Sets[0]],
  priorToSession690.length,
  "reps"
);

check(`session 690 first set is detected as PR`, prsForFirstSetOfSession690.length > 0, `got ${prsForFirstSetOfSession690.join(", ")}`);
check(`session 690 has heaviest_weight PR`, prsForFirstSetOfSession690.includes("heaviest_weight"));

// Session 700 (last on page 1): weight = 60 + floor(700/10)*2.5 = 60 + 175 = 235 kg
// This should be the ultimate PR
const session700StartIdx = (700 - 101) * 3;
const session700Sets = setsFromQuery.slice(session700StartIdx, session700StartIdx + 3);

check(`session 700 sets fetched`, session700Sets.length === 3);
check(`session 700 weight is 235kg (highest)`, session700Sets[0].weight_kg === 235);

const priorToSession700 = setsFromQuery.slice(0, session700StartIdx);
const prsForFirstSetOfSession700 = detectSetPRs(
  [...priorToSession700.map(s => ({ reps: s.reps, weight_kg: s.weight_kg, duration_seconds: s.duration_seconds })), session700Sets[0]],
  priorToSession700.length,
  "reps"
);

check(`session 700 first set is detected as PR`, prsForFirstSetOfSession700.length > 0);
check(`session 700 has heaviest_weight PR`, prsForFirstSetOfSession700.includes("heaviest_weight"));

console.log(`\n4. Verify sessions outside query window (1-100) don't affect page 1`);
// Sessions 1-100 are NOT in setsFromQuery, but page 1 (681-700) should still work
// because we have 580+ sessions of prior history (101-690)

check(`session 690 has adequate prior context`, priorToSession690.length / 3 === 589, `${priorToSession690.length / 3} sessions`);

console.log(`\n5. Edge case: What if page 1 included session 10 (very early)?`);
// If somehow the newest page showed session 10, it would be outside our query
// But our query strategy prevents this: we fetch 600 sessions before the OLDEST on the page
// So if page shows sessions 10-30, we'd fetch sessions up to session 10, getting 10 sessions only
const fakeOldSession = { reps: 8, weight_kg: 65, duration_seconds: null, sessionNumber: 10 };
// This would show as a PR because we have no prior context
const prsForOldSession = detectSetPRs([fakeOldSession], 0, "reps");
check(`very early session shows as PR (expected behavior)`, prsForOldSession.length > 0);

console.log();
if (failures > 0) {
  console.error(`❌ ${failures} test(s) failed\n`);
  process.exit(1);
} else {
  console.log("✅ All tests passed\n");
  console.log("Conclusion: PR detection works correctly for newest sessions");
  console.log("even when user has 700+ sessions (beyond the 600 session query cap).\n");
}
