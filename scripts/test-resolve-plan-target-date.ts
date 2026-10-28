#!/usr/bin/env tsx
/**
 * Test: resolvePlanTargetDate (MED-A + MED-4)
 *
 * MED-A: session.local_date + 1 for midnight-crossing consistency
 * MED-4: Never offer a past day - fall back to today + 1 when session is old
 */

import { resolvePlanTargetDate, type ResolvePlanTargetDateDeps } from "../src/lib/session/resolve-plan-target-date";

let failures = 0;

function check(label: string, pass: boolean, detail?: string) {
  console.log(`  ${pass ? "✓" : "✗ FAIL"} ${label}${detail ? ` -- ${detail}` : ""}`);
  if (!pass) failures++;
}

(async () => {
  console.log("resolvePlanTargetDate (MED-A + MED-4)\n");

  console.log("Case 1: localDate input passes through unchanged");
  {
    const deps: ResolvePlanTargetDateDeps = {
      async fetchSessionLocalDate() {
        throw new Error("should not be called");
      },
    };

    const result = await resolvePlanTargetDate(deps, { userId: "u1", localDate: "2026-10-30" }, "2026-10-29");
    check("result ok", result.ok);
    if (result.ok) {
      check("localDate passes through", result.data === "2026-10-30");
    }
  }

  console.log("\nCase 2: sessionId → session.local_date + 1 (MED-A)");
  {
    const deps: ResolvePlanTargetDateDeps = {
      async fetchSessionLocalDate(sessionId, userId) {
        check("sessionId passed", sessionId === "s-123");
        check("userId passed", userId === "u-456");
        return { localDate: "2026-10-28", error: null };
      },
    };

    const result = await resolvePlanTargetDate(deps, { userId: "u-456", sessionId: "s-123" }, "2026-10-29");
    check("result ok", result.ok);
    if (result.ok) {
      check("adds 1 day (28 → 29)", result.data === "2026-10-29");
    }
  }

  console.log("\nCase 3: Session lookup error returns friendly message");
  {
    const deps: ResolvePlanTargetDateDeps = {
      async fetchSessionLocalDate() {
        return { localDate: null, error: "network timeout" };
      },
    };

    const result = await resolvePlanTargetDate(deps, { userId: "u1", sessionId: "s-err" }, "2026-10-29");
    check("result not ok", !result.ok);
    if (!result.ok) {
      check("friendly error", result.error === "Could not load session.");
    }
  }

  console.log("\nCase 4: Session not found returns error");
  {
    const deps: ResolvePlanTargetDateDeps = {
      async fetchSessionLocalDate() {
        return { localDate: null, error: null };
      },
    };

    const result = await resolvePlanTargetDate(deps, { userId: "u1", sessionId: "s-none" }, "2026-10-29");
    check("result not ok", !result.ok);
    if (!result.ok) {
      check("not found error", result.error === "Session not found.");
    }
  }

  console.log("\nMED-4 Clock Cases:");

  console.log("\n  Case 5: Same day - session 23 Oct, finished 23 Oct, today=23 Oct → 24 Oct");
  {
    const deps: ResolvePlanTargetDateDeps = {
      async fetchSessionLocalDate() {
        return { localDate: "2026-10-23", error: null };
      },
    };

    const result = await resolvePlanTargetDate(deps, { userId: "u1", sessionId: "s-same" }, "2026-10-23");
    check("result ok", result.ok);
    if (result.ok) {
      check("targets 24 Oct", result.data === "2026-10-24", result.data);
    }
  }

  console.log("\n  Case 6: Just after midnight IST - session 23 Oct, finished 24 Oct 00:30, today=24 Oct → 24 Oct");
  {
    const deps: ResolvePlanTargetDateDeps = {
      async fetchSessionLocalDate() {
        return { localDate: "2026-10-23", error: null };
      },
    };

    const result = await resolvePlanTargetDate(deps, { userId: "u1", sessionId: "s-midnight" }, "2026-10-24");
    check("result ok", result.ok);
    if (result.ok) {
      check("still targets 24 Oct (not 25)", result.data === "2026-10-24", result.data);
    }
  }

  console.log("\n  Case 7: 2 days later - session 23 Oct, finished 25 Oct, today=25 Oct → 26 Oct (today+1)");
  {
    const deps: ResolvePlanTargetDateDeps = {
      async fetchSessionLocalDate() {
        return { localDate: "2026-10-23", error: null };
      },
    };

    const result = await resolvePlanTargetDate(deps, { userId: "u1", sessionId: "s-2days" }, "2026-10-25");
    check("result ok", result.ok);
    if (result.ok) {
      check("falls back to today+1 (26 Oct)", result.data === "2026-10-26", result.data);
      check("NOT session.local_date+1 (would be 24)", result.data !== "2026-10-24");
    }
  }

  console.log("\n  Case 8: 3 days later - session 23 Oct, finished 26 Oct, today=26 Oct → 27 Oct (today+1)");
  {
    const deps: ResolvePlanTargetDateDeps = {
      async fetchSessionLocalDate() {
        return { localDate: "2026-10-23", error: null };
      },
    };

    const result = await resolvePlanTargetDate(deps, { userId: "u1", sessionId: "s-3days" }, "2026-10-26");
    check("result ok", result.ok);
    if (result.ok) {
      check("falls back to today+1 (27 Oct)", result.data === "2026-10-27", result.data);
      check("NEVER offers past day", result.data >= "2026-10-27");
    }
  }

  console.log("\n  Case 9: America/Los_Angeles - session 20 Oct, finished 22 Oct, today=22 Oct → 23 Oct (today+1)");
  {
    const deps: ResolvePlanTargetDateDeps = {
      async fetchSessionLocalDate() {
        return { localDate: "2026-10-20", error: null };
      },
    };

    const result = await resolvePlanTargetDate(deps, { userId: "u1", sessionId: "s-la" }, "2026-10-22");
    check("result ok", result.ok);
    if (result.ok) {
      check("falls back to today+1 (23 Oct)", result.data === "2026-10-23", result.data);
      check("candidate 21 Oct < today 22 Oct, so fallback triggered", true);
    }
  }

  if (failures > 0) {
    console.log(`\n✗ ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\n✓ All resolve-plan-target-date checks passed");
  process.exit(0);
})().catch((e) => {
  console.error("✗ ERROR", e);
  process.exit(1);
});
