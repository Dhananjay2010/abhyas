/**
 * Test: startTomorrowCore shifts program dates
 * 
 * Verifies:
 * - Shifts started_on and ends_on by +1 day
 * - Rejects when no program exists
 * - Rejects for non-block-1 programs
 * - Rejects when sessions started
 * - Idempotent (two calls shift only once)
 * 
 * Run: npx tsx scripts/test-start-tomorrow-core.ts
 */

import { strict as assert } from "node:assert";
import { startTomorrowCore, type StartTomorrowDeps } from "../src/lib/program/start-tomorrow-core";

console.log("Test: startTomorrowCore shifts program dates\n");

type Program = {
  id: string;
  block_number: number;
  started_on: string;
  ends_on: string;
};

type Session = {
  id: string;
  status: string;
};

(async () => {
  console.log("1. Shifts started_on and ends_on by +1 day");
  {
    let updatedProgramId: string | null = null;
    let updatedStartedOn: string | null = null;
    let updatedEndsOn: string | null = null;

    const program: Program = {
      id: "prog1",
      block_number: 1,
      started_on: "2026-10-27",
      ends_on: "2026-11-23",
    };

    const deps: StartTomorrowDeps = {
      getActiveProgram: async () => program,
      getStartedSessions: async () => [],
      updateProgramDates: async (programId, started_on, ends_on) => {
        updatedProgramId = programId;
        updatedStartedOn = started_on;
        updatedEndsOn = ends_on;
      },
      tomorrow: "2026-10-28",
    };

    const result = await startTomorrowCore(deps);
    
    assert.ok(result.ok, "Result should be ok");
    assert.equal(updatedProgramId, "prog1", "Should update correct program");
    assert.equal(updatedStartedOn, "2026-10-28", "started_on shifted by +1 day");
    assert.equal(updatedEndsOn, "2026-11-24", "ends_on shifted by +1 day");
    console.log("  ✓ Dates shifted correctly");
    }

  console.log("\n2. Rejects when no program exists");
  {
  const deps: StartTomorrowDeps = {
    getActiveProgram: async () => null,
    getStartedSessions: async () => [],
    updateProgramDates: async () => {},
    tomorrow: "2026-10-28",
  };

  const result = await startTomorrowCore(deps);
  
  assert.ok(!result.ok, "Should fail when no program");
  assert.equal(result.error, "No active program", "Correct error message");
  console.log("  ✓ Rejects with 'No active program'");
  }

  console.log("\n3. Rejects for non-block-1 programs");
  {
  const program: Program = {
    id: "prog2",
    block_number: 2,
    started_on: "2026-10-27",
    ends_on: "2026-11-23",
  };

  const deps: StartTomorrowDeps = {
    getActiveProgram: async () => program,
    getStartedSessions: async () => [],
    updateProgramDates: async () => {},
    tomorrow: "2026-10-28",
  };

  const result = await startTomorrowCore(deps);
  
  assert.ok(!result.ok, "Should fail for block 2");
  assert.equal(result.error, "Only allowed for new plans", "Correct error message");
  console.log("  ✓ Rejects with 'Only allowed for new plans'");
  }

  console.log("\n4. Rejects when sessions started");
  {
  const program: Program = {
    id: "prog1",
    block_number: 1,
    started_on: "2026-10-27",
    ends_on: "2026-11-23",
  };

  const sessions: Session[] = [
    { id: "sess1", status: "in_progress" },
  ];

  const deps: StartTomorrowDeps = {
    getActiveProgram: async () => program,
    getStartedSessions: async () => sessions,
    updateProgramDates: async () => {},
    tomorrow: "2026-10-28",
  };

  const result = await startTomorrowCore(deps);
  
  assert.ok(!result.ok, "Should fail when session started");
  assert.equal(result.error, "Plan already started", "Correct error message");
  console.log("  ✓ Rejects with 'Plan already started'");
  }

  console.log("\n5. Idempotent: two calls shift only once");
  {
  let updateCallCount = 0;

  const program: Program = {
    id: "prog1",
    block_number: 1,
    started_on: "2026-10-28", // Already shifted
    ends_on: "2026-11-24",
  };

  const deps: StartTomorrowDeps = {
    getActiveProgram: async () => program,
    getStartedSessions: async () => [],
    updateProgramDates: async () => {
      updateCallCount++;
    },
    tomorrow: "2026-10-28",
  };

  const result = await startTomorrowCore(deps);
  
  assert.ok(result.ok, "Should succeed");
  assert.equal(updateCallCount, 0, "Should not call update when already shifted");
  console.log("  ✓ Idempotent: skips update when already shifted");
  }

  console.log("\n6. Update is never called for unauthenticated or blocked cases");
  {
  let updateCalled = false;

  const noProgram: StartTomorrowDeps = {
    getActiveProgram: async () => null,
    getStartedSessions: async () => [],
    updateProgramDates: async () => { updateCalled = true; },
    tomorrow: "2026-10-28",
  };

  await startTomorrowCore(noProgram);
  assert.ok(!updateCalled, "Update not called when no program");

  updateCalled = false;
  const block2: StartTomorrowDeps = {
    getActiveProgram: async () => ({
      id: "prog2",
      block_number: 2,
      started_on: "2026-10-27",
      ends_on: "2026-11-23",
    }),
    getStartedSessions: async () => [],
    updateProgramDates: async () => { updateCalled = true; },
    tomorrow: "2026-10-28",
  };

  await startTomorrowCore(block2);
  assert.ok(!updateCalled, "Update not called for block 2");

  updateCalled = false;
  const withSession: StartTomorrowDeps = {
    getActiveProgram: async () => ({
      id: "prog1",
      block_number: 1,
      started_on: "2026-10-27",
      ends_on: "2026-11-23",
    }),
    getStartedSessions: async () => [{ id: "sess1", status: "completed" }],
    updateProgramDates: async () => { updateCalled = true; },
    tomorrow: "2026-10-28",
  };

  await startTomorrowCore(withSession);
  assert.ok(!updateCalled, "Update not called when session started");

  console.log("  ✓ Update never called for blocked cases");
}

  console.log("\n✅ All startTomorrowCore tests passed");
})();
