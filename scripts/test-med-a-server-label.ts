#!/usr/bin/env tsx
/**
 * Test: sessionPlanTargetDate helper (MED-A M-A3)
 *
 * Verifies:
 * - M-A3: sessionPlanTargetDate adds exactly 1 day to session.local_date
 * - MED-4: planTargetDate never returns a day before user-local today
 */

import { sessionPlanTargetDate, planTargetDate } from "../src/lib/session/resolve-plan-target-date";

let failures = 0;

function check(label: string, pass: boolean, detail?: string) {
  console.log(`  ${pass ? "✓" : "✗ FAIL"} ${label}${detail ? ` -- ${detail}` : ""}`);
  if (!pass) failures++;
}

(async () => {
  console.log("MED-A sessionPlanTargetDate\n");

  console.log("Case 1: M-A3 - sessionPlanTargetDate adds exactly 1 day");
  {
    const result = sessionPlanTargetDate("2026-10-26");
    check("2026-10-26 + 1 = 2026-10-27", result === "2026-10-27", result);
    check("NOT 2026-10-26 (0 days)", result !== "2026-10-26");
    check("NOT 2026-10-28 (2 days)", result !== "2026-10-28");
  }

  console.log("\nCase 2: M-A3 - sessionPlanTargetDate works across month boundary");
  {
    const result = sessionPlanTargetDate("2026-10-31");
    check("2026-10-31 + 1 = 2026-11-01", result === "2026-11-01", result);
  }

  console.log("\nCase 3: M-A3 - sessionPlanTargetDate works across year boundary");
  {
    const result = sessionPlanTargetDate("2026-12-31");
    check("2026-12-31 + 1 = 2027-01-01", result === "2027-01-01", result);
  }

  console.log("\nCase 4: MED-4 - planTargetDate (shared by page and planDay)");
  {
    check("same day: 28 Oct session, today 28 -> 29", planTargetDate("2026-10-28", "2026-10-28") === "2026-10-29");
    check("after midnight: 28 Oct session, today 29 -> 29", planTargetDate("2026-10-28", "2026-10-29") === "2026-10-29");
    check("stale: 24 Oct session, today 28 -> 29 (today+1)", planTargetDate("2026-10-24", "2026-10-28") === "2026-10-29", planTargetDate("2026-10-24", "2026-10-28"));
    check("stale across month: 29 Oct session, today 2 Nov -> 3 Nov", planTargetDate("2026-10-29", "2026-11-02") === "2026-11-03");
  }

  // M-A1 / M-A2 (page passes the session's target date; nextDayPlan honours
  // it) used to be exact-string source scans here (QA3 r3 LOW-3). They are now
  // pinned by behaviour in scripts/test-session-page-tomorrow-wiring.ts, which
  // calls the real page and reads the date nextDayPlan actually queried.

  if (failures > 0) {
    console.log(`\n✗ ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\n✓ All MED-A sessionPlanTargetDate checks passed");
  process.exit(0);
})().catch((e) => {
  console.error("✗ ERROR", e);
  process.exit(1);
});
