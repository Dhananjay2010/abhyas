#!/usr/bin/env tsx
/**
 * Test: resolvePlanTargetDate - session-based date resolution
 *
 * MED-3: Target date must be session.local_date + 1, computed server-side.
 * Handles midnight crossing: session started 23:50, finished 00:20 -> targets D+1.
 */

import { resolvePlanTargetDate, type ResolvePlanTargetDateDeps } from "../src/lib/session/resolve-plan-target-date";

let failures = 0;

function check(label: string, pass: boolean, detail?: string) {
  console.log(`  ${pass ? "✓" : "✗ FAIL"} ${label}${detail ? ` -- ${detail}` : ""}`);
  if (!pass) failures++;
}

(async () => {
  console.log("Resolve Plan Target Date\n");

  console.log("Case 1: sessionId with midnight crossing");
  {
    // Session started 23:50 IST on 2026-10-26, finished 00:20 IST on 2026-10-27
    // Session's local_date is 2026-10-26 (day D)
    // Current time is already 2026-10-27 (day D+1)
    // Must return D+1 (2026-10-27), not D (2026-10-26) and not D+2 (2026-10-28)
    const deps: ResolvePlanTargetDateDeps = {
      async fetchSessionLocalDate(sessionId, userId) {
        if (sessionId === "session-midnight" && userId === "user-123") {
          return { localDate: "2026-10-26", error: null };
        }
        return { localDate: null, error: "not found" };
      },
    };

    const result = await resolvePlanTargetDate(deps, {
      userId: "user-123",
      sessionId: "session-midnight",
    });

    check("result ok", result.ok);
    if (result.ok) {
      check("returns D+1 (2026-10-27)", result.data === "2026-10-27", result.data);
      check("not D (2026-10-26)", result.data !== "2026-10-26");
      check("not D+2 (2026-10-28)", result.data !== "2026-10-28");
    }
  }

  console.log("\nCase 2: missing session (another user's or not found)");
  {
    const deps: ResolvePlanTargetDateDeps = {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async fetchSessionLocalDate(_sessionId, _userId) {
        return { localDate: null, error: null };
      },
    };

    const result = await resolvePlanTargetDate(deps, {
      userId: "user-123",
      sessionId: "session-missing",
    });

    check("result not ok", !result.ok);
    if (!result.ok) {
      check("friendly error message", result.error === "Session not found.", result.error);
    }
  }

  console.log("\nCase 3: fetch error (DB error)");
  {
    const deps: ResolvePlanTargetDateDeps = {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async fetchSessionLocalDate(sessionId, userId) {
        return { localDate: null, error: "connection failed" };
      },
    };

    const result = await resolvePlanTargetDate(deps, {
      userId: "user-123",
      sessionId: "session-error",
    });

    check("result not ok", !result.ok);
    if (!result.ok) {
      check("friendly error (no raw DB text)", result.error === "Could not load session.", result.error);
    }
  }

  console.log("\nCase 4: localDate path unchanged");
  {
    const deps: ResolvePlanTargetDateDeps = {
      async fetchSessionLocalDate() {
        throw new Error("Should not be called");
      },
    };

    const result = await resolvePlanTargetDate(deps, {
      userId: "user-123",
      localDate: "2026-10-28",
    });

    check("result ok", result.ok);
    if (result.ok) {
      check("returns localDate unchanged", result.data === "2026-10-28", result.data);
    }
  }

  console.log("\nCase 5: neither sessionId nor localDate");
  {
    const deps: ResolvePlanTargetDateDeps = {
      async fetchSessionLocalDate() {
        throw new Error("Should not be called");
      },
    };

    const result = await resolvePlanTargetDate(deps, {
      userId: "user-123",
    });

    check("result not ok", !result.ok);
    if (!result.ok) {
      check("error message", result.error.includes("required"), result.error);
    }
  }

  console.log("\nCase 6: session from different date (no midnight crossing)");
  {
    const deps: ResolvePlanTargetDateDeps = {
      async fetchSessionLocalDate(sessionId, userId) {
        if (sessionId === "session-normal" && userId === "user-456") {
          return { localDate: "2026-10-25", error: null };
        }
        return { localDate: null, error: "not found" };
      },
    };

    const result = await resolvePlanTargetDate(deps, {
      userId: "user-456",
      sessionId: "session-normal",
    });

    check("result ok", result.ok);
    if (result.ok) {
      check("returns local_date + 1", result.data === "2026-10-26", result.data);
    }
  }

  console.log("\nCase 7: MED-B N6 - session lookup IS scoped by userId");
  {
    let capturedSessionId = "";
    let capturedUserId = "";
    const deps: ResolvePlanTargetDateDeps = {
      async fetchSessionLocalDate(sessionId, userId) {
        capturedSessionId = sessionId;
        capturedUserId = userId;
        return { localDate: "2026-10-27", error: null };
      },
    };

    await resolvePlanTargetDate(deps, {
      userId: "user-scoped",
      sessionId: "session-123",
    });

    check("sessionId passed to fetch", capturedSessionId === "session-123");
    check("userId passed to fetch (verifies scoping)", capturedUserId === "user-scoped");
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
