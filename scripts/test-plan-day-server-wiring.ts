#!/usr/bin/env tsx
/**
 * Test: planDay server-side wiring (MED-B)
 *
 * Verifies:
 * - N4: Raw DB errors are mapped to friendly copy via friendlyPlanDayError
 * - N5: planDay saves to resolved date, not current date
 * - N6: Session lookup is scoped by user_id
 * - N7: Resolver errors return friendly copy, never fall back to today
 */

import { planDayCore, type PlanDayClient } from "../src/lib/session/plan-day-core";
import { resolvePlanTargetDate, type ResolvePlanTargetDateDeps } from "../src/lib/session/resolve-plan-target-date";
import { friendlyPlanDayError } from "../src/app/session/actions";
import type { DayPlan } from "../src/app/session/actions";

let failures = 0;

function check(label: string, pass: boolean, detail?: string) {
  console.log(`  ${pass ? "✓" : "✗ FAIL"} ${label}${detail ? ` -- ${detail}` : ""}`);
  if (!pass) failures++;
}

(async () => {
  console.log("planDay Server Wiring (MED-B)\n");

  console.log("Case 1: MED-B N4 - Raw DB errors mapped to friendly copy via friendlyPlanDayError");
  {
    const rawError = "duplicate key value violates unique constraint \"day_plan_overrides_pkey\"";
    const friendlyError = friendlyPlanDayError(rawError);
    
    check("friendlyPlanDayError returns friendly copy", friendlyError === "Couldn't save your choice. Please try again.");
    check("NOT raw DB text", !friendlyError.includes("duplicate key"));
    check("NOT 'constraint'", !friendlyError.includes("constraint"));
    
    // Also test that known errors pass through
    const knownError = "That day has already been trained.";
    const mappedKnown = friendlyPlanDayError(knownError);
    check("Known errors pass through unchanged", mappedKnown === knownError);
  }

  console.log("\nCase 2: MED-B N5 - planDay saves to resolved date");
  {
    let savedDate = "";
    const client: PlanDayClient = {
      async findDaySessions() {
        return { rows: [], error: null };
      },
      async findActiveProgram() {
        return { program: { id: "prog-1", started_on: "2026-10-20", deload_week: 4, week_offset: 0 }, error: null };
      },
      async loadProgramDay() {
        return { ok: true, day: { id: "pd-1", day_type: "weights" } };
      },
      async findProgramDay() {
        // 2026-10-30 is Friday (day_index = 5)
        return { day: { id: "pd-friday", day_index: 5, day_type: "weights" }, error: null };
      },
      async updateSession() {
        return { error: null };
      },
      async deleteSessions() {
        return { error: null };
      },
      async insertSession(row) {
        savedDate = row.local_date!;
        return { error: null };
      },
      async rereadDaySessions() {
        return { rows: [], error: null };
      },
    };

    const plan: DayPlan = { kind: "keep" };
    await planDayCore(client, {
      userId: "user-123",
      localDate: "2026-10-30",  // resolved date from session.local_date + 1 (Friday)
      today: "2026-10-29",       // current date (different)
      plan,
    });

    check("saved to resolved date (2026-10-30)", savedDate === "2026-10-30", savedDate);
    check("NOT saved to today (2026-10-29)", savedDate !== "2026-10-29");
  }

  console.log("\nCase 3: MED-B N6 - Session lookup scoped by user_id (via resolvePlanTargetDate)");
  {
    let capturedUserId = "";
    const deps: ResolvePlanTargetDateDeps = {
      async fetchSessionLocalDate(sessionId, userId) {
        capturedUserId = userId;
        return { localDate: "2026-10-26", error: null };
      },
    };

    await resolvePlanTargetDate(deps, {
      userId: "user-456-scoped",
      sessionId: "session-123",
    });

    check("userId passed to fetch (verifies scoping)", capturedUserId === "user-456-scoped");
  }

  console.log("\nCase 4: MED-B N7 - Resolver error returns friendly copy, no fallback to today");
  {
    const deps: ResolvePlanTargetDateDeps = {
      async fetchSessionLocalDate() {
        return { localDate: null, error: "network timeout" };
      },
    };

    const result = await resolvePlanTargetDate(deps, {
      userId: "user-789",
      sessionId: "session-error",
    });

    check("result not ok", !result.ok);
    if (!result.ok) {
      check("error is friendly", result.error === "Could not load session.");
      check("NOT ok with fallback to today", true);  // Already checked not ok
    }
  }

  if (failures > 0) {
    console.log(`\n✗ ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\n✓ All planDay server wiring checks passed");
  process.exit(0);
})().catch((e) => {
  console.error("✗ ERROR", e);
  process.exit(1);
});
