#!/usr/bin/env tsx
/**
 * Test: sessionPlanTargetDate helper (MED-A M-A3)
 *
 * Verifies:
 * - M-A3: sessionPlanTargetDate adds exactly 1 day to session.local_date
 */

import { sessionPlanTargetDate } from "../src/lib/session/resolve-plan-target-date";

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

  console.log("\nCase 4: M-A1 - page.tsx source uses sessionPlanTargetDate");
  {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");
    const pageSource = fs.readFileSync("src/app/session/[id]/page.tsx", "utf8");
    const hasImport = pageSource.includes('sessionPlanTargetDate } = await import("@/lib/session/resolve-plan-target-date")');
    const hasCall = pageSource.includes("sessionPlanTargetDate(session.local_date)");
    const hasParameter = pageSource.includes("nextDayPlan(supabase, timezone, sessionTargetDate)");
    
    check("M-A1: imports sessionPlanTargetDate", hasImport);
    check("M-A1: calls sessionPlanTargetDate(session.local_date)", hasCall);
    check("M-A1: passes result to nextDayPlan", hasParameter);
  }

  console.log("\nCase 5: M-A2 - nextDayPlan source uses targetLocalDate parameter");
  {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs");
    const dayPlanSource = fs.readFileSync("src/lib/program/day-plan.ts", "utf8");
    const hasParameter = dayPlanSource.includes("targetLocalDate?: string");
    const hasSessionHelper = dayPlanSource.includes('sessionPlanTargetDate } = await import("@/lib/session/resolve-plan-target-date")');
    const usesTargetOrHelper = dayPlanSource.includes("targetLocalDate ?? sessionPlanTargetDate(localDateString(timezone))");
    
    check("M-A2: nextDayPlan accepts targetLocalDate parameter", hasParameter);
    check("M-A2: nextDayPlan imports sessionPlanTargetDate", hasSessionHelper);
    check("M-A2: nextDayPlan uses targetLocalDate ?? sessionPlanTargetDate(localDateString(timezone))", usesTargetOrHelper);
  }

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
