#!/usr/bin/env tsx
/**
 * Test: Keep button behavior with programDayId
 *
 * Behavioral test for MED-1 Keep button fix:
 * - When programDayId is provided (collision resolved), Keep sends {kind:"training", programDayId}
 * - When programDayId is null (no collision, Today page), Keep sends {kind:"keep"}
 * - Keep NEVER sends {kind:"rest"}
 *
 * Mutant killed: reverting Keep to always {kind:"keep"} causes collision-resolved
 * case to fail with "Expected {kind:'training', programDayId:'pd-c'}, got {kind:'keep'}".
 */

import "./helpers/setup-jsdom";
import { strict as assert } from "node:assert";

type PlanDay = { kind: string; programDayId?: string };
type PlanInput = { localDate: string; plan: PlanDay };

async function main() {
  console.log("\nKeep button: collision-resolved vs Today page\n");

  const React = await import("react");
  const { render, cleanup } = await import("@testing-library/react");
  const userEvent = (await import("@testing-library/user-event")).default;
  const { DayPlanPrompt } = await import("@/components/day-plan-prompt");
  
  // Test 1: Collision-resolved prompt (programDayId = 'pd-c')
  console.log("1. Collision-resolved: Keep sends {kind:'training', programDayId}");
  {
    const calls: PlanDay[] = [];
    const mockPlanDay = async (input: PlanInput): Promise<{ ok: true }> => {
      calls.push(input.plan);
      return { ok: true };
    };

    const { container } = render(
      React.createElement(DayPlanPrompt, {
        localDate: "2026-10-29",
        dayLabel: "Tomorrow",
        plannedLabel: "Full Body C",
        programDayId: "pd-c",
        days: [
          { programDayId: "pd-a", label: "Full Body A", dayType: "weights" as const, nextUp: true },
          { programDayId: "pd-b", label: "Full Body B", dayType: "weights" as const, nextUp: false },
          { programDayId: "pd-c", label: "Full Body C", dayType: "weights" as const, nextUp: false },
        ],
        heading: "What about tomorrow?",
        showRestOption: true,
        onPlan: mockPlanDay,
      })
    );

    const keepButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Keep it")
    );
    assert.ok(keepButton, "Should have Keep it button");

    await userEvent.click(keepButton);

    assert.strictEqual(calls.length, 1, "Should have 1 call");
    const plan = calls[0];
    assert.strictEqual(plan.kind, "training", "Keep should send kind:training");
    assert.strictEqual(plan.programDayId, "pd-c", "Keep should send resolved programDayId");

    cleanup();
    
    console.log(`  ✓ Keep sent {kind:"training", programDayId:"pd-c"}`);
  }

  // Test 2: Today page (programDayId = null, no collision)
  console.log("\n2. Today page (null programDayId): Keep sends {kind:'keep'}, NOT rest");
  {
    const calls: PlanDay[] = [];
    const mockPlanDay = async (input: PlanInput): Promise<{ ok: true }> => {
      calls.push(input.plan);
      return { ok: true };
    };

    const { container } = render(
      React.createElement(DayPlanPrompt, {
        localDate: "2026-10-27",
        dayLabel: "Today",
        plannedLabel: "Full Body B",
        programDayId: null,
        days: [
          { programDayId: "pd-a", label: "Full Body A", dayType: "weights" as const, nextUp: false },
          { programDayId: "pd-b", label: "Full Body B", dayType: "weights" as const, nextUp: true },
          { programDayId: "pd-c", label: "Full Body C", dayType: "weights" as const, nextUp: false },
        ],
        heading: "Or train today anyway",
        showRestOption: false,
        onPlan: mockPlanDay,
      })
    );

    const keepButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Keep it")
    );
    assert.ok(keepButton, "Should have Keep it button");

    await userEvent.click(keepButton);

    assert.strictEqual(calls.length, 1, "Should have 1 call");
    const plan = calls[0];
    assert.strictEqual(plan.kind, "keep", "Keep should send kind:keep (not rest)");
    assert.strictEqual(plan.programDayId, undefined, "Keep should not send programDayId");

    cleanup();
    
    console.log(`  ✓ Keep sent {kind:"keep"}, not rest`);
  }

  // Test 3: Yoga day (programDayId = null)
  console.log("\n3. Yoga day (null programDayId): Keep sends {kind:'keep'}, NOT rest");
  {
    const calls: PlanDay[] = [];
    const mockPlanDay = async (input: PlanInput): Promise<{ ok: true }> => {
      calls.push(input.plan);
      return { ok: true };
    };

    const { container } = render(
      React.createElement(DayPlanPrompt, {
        localDate: "2026-10-28",
        dayLabel: "Today",
        plannedLabel: "Yoga",
        programDayId: null,
        days: [
          { programDayId: "pd-a", label: "Full Body A", dayType: "weights" as const, nextUp: true },
          { programDayId: "pd-b", label: "Full Body B", dayType: "weights" as const, nextUp: false },
        ],
        heading: "Or train today anyway",
        showRestOption: false,
        onPlan: mockPlanDay,
      })
    );

    const keepButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Keep it")
    );
    assert.ok(keepButton, "Should have Keep it button");

    await userEvent.click(keepButton);

    assert.strictEqual(calls.length, 1, "Should have 1 call");
    const plan = calls[0];
    assert.strictEqual(plan.kind, "keep", "Keep should send kind:keep for yoga (not rest)");
    assert.strictEqual(plan.programDayId, undefined, "Keep should not send programDayId");

    cleanup();
    
    console.log(`  ✓ Yoga Keep sent {kind:"keep"}, not rest`);
  }

  console.log("\n✓ All Keep button tests passed\n");
  console.log("Mutant killed: reverting Keep to {kind:'keep'} when programDayId='pd-c'");
  console.log("would fail test 1 with 'Expected kind:training, got kind:keep'\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
