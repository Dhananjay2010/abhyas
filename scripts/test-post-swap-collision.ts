/**
 * Test: Post-swap collision resolution
 * 
 * Tests the resolveTomorrowAfterSwap function that prevents back-to-back repeats
 * when a rest-day swap collides with tomorrow's scheduled workout.
 * 
 * Run: npx tsx scripts/test-post-swap-collision.ts
 */

import { strict as assert } from "node:assert";
import { resolveTomorrowAfterSwap, wasSwapDay } from "../src/lib/program/day-plan";

console.log("Test: Post-swap collision resolution\n");

type ProgramDay = {
  id: string;
  label: string | null;
  day_type: string;
  day_index: number;
};

console.log("1. Swap with collision: serves next in rotation");
{
  const rotation: ProgramDay[] = [
    { id: "upper-1", label: "Upper", day_type: "weights", day_index: 1 },
    { id: "lower-1", label: "Lower", day_type: "weights", day_index: 2 },
  ];

  const result = resolveTomorrowAfterSwap({
    todayWasSwap: true,
    doneProgramDayId: "lower-1",
    scheduledTomorrow: { programDayId: "lower-1", label: "Lower" },
    rotation,
  });

  assert.ok(result, "Should resolve collision");
  assert.equal(result.label, "Upper", "Next in rotation is Upper");
  assert.equal(result.programDayId, "upper-1", "ProgramDayId is upper-1");
  console.log("  ✓ Collision resolved: serves Upper with programDayId");
}

console.log("\n2. Normal day (no swap): no collision resolution");
{
  const rotation: ProgramDay[] = [
    { id: "day-a", label: "Full Body A", day_type: "weights", day_index: 1 },
    { id: "day-b", label: "Full Body B", day_type: "weights", day_index: 3 },
  ];

  const result = resolveTomorrowAfterSwap({
    todayWasSwap: false,
    doneProgramDayId: "day-a",
    scheduledTomorrow: { programDayId: "day-a", label: "Full Body A" },
    rotation,
  });

  assert.ok(!result, "Should not resolve (not a swap)");
  console.log("  ✓ No swap: no collision resolution");
}

console.log("\n3. Swap to different workout: no collision");
{
  const rotation: ProgramDay[] = [
    { id: "day-a", label: "Full Body A", day_type: "weights", day_index: 1 },
    { id: "day-b", label: "Full Body B", day_type: "weights", day_index: 3 },
    { id: "day-c", label: "Full Body C", day_type: "weights", day_index: 5 },
  ];

  const result = resolveTomorrowAfterSwap({
    todayWasSwap: true,
    doneProgramDayId: "day-c",
    scheduledTomorrow: null, // Rest day tomorrow
    rotation,
  });

  assert.ok(!result, "Should not resolve (different tomorrow)");
  console.log("  ✓ Swap to different workout: no collision");
}

console.log("\n4. Wraps around rotation");
{
  const rotation: ProgramDay[] = [
    { id: "day-a", label: "Full Body A", day_type: "weights", day_index: 1 },
    { id: "day-b", label: "Full Body B", day_type: "weights", day_index: 3 },
    { id: "day-c", label: "Full Body C", day_type: "weights", day_index: 5 },
  ];

  // Did day-c (last), tomorrow is also day-c
  const result = resolveTomorrowAfterSwap({
    todayWasSwap: true,
    doneProgramDayId: "day-c",
    scheduledTomorrow: { programDayId: "day-c", label: "Full Body C" },
    rotation,
  });

  assert.ok(result, "Should resolve collision");
  assert.equal(result.label, "Full Body A", "Wraps to first");
  assert.equal(result.programDayId, "day-a", "ProgramDayId wraps to day-a");
  console.log("  ✓ Wraps around: day-c → day-a");
}

console.log("\n5. Swap but tomorrow is different day: no collision");
{
  const rotation: ProgramDay[] = [
    { id: "day-a", label: "Full Body A", day_type: "weights", day_index: 1 },
    { id: "day-b", label: "Full Body B", day_type: "weights", day_index: 3 },
  ];

  const result = resolveTomorrowAfterSwap({
    todayWasSwap: true,
    doneProgramDayId: "day-a",
    scheduledTomorrow: { programDayId: "day-b", label: "Full Body B" },
    rotation,
  });

  assert.ok(!result, "Should not resolve (tomorrow is different)");
  console.log("  ✓ Swap with different tomorrow: no collision");
}

console.log("\n6. wasSwapDay: Rest day swap");
{
  const wasSwap = wasSwapDay({
    completedProgramDayId: "day-a",
    scheduledProgramDayId: null, // Rest day
    completedActualType: "weights",
  });
  
  assert.ok(wasSwap, "Should be a swap when scheduled Rest but did a workout");
  console.log("  ✓ Rest day swap detected");
}

console.log("\n7. wasSwapDay: Different program day");
{
  const wasSwap = wasSwapDay({
    completedProgramDayId: "day-b",
    scheduledProgramDayId: "day-a",
    completedActualType: "weights",
  });
  
  assert.ok(wasSwap, "Should be a swap when different program day");
  console.log("  ✓ Different program day swap detected");
}

console.log("\n8. wasSwapDay: Not a swap (same day)");
{
  const wasSwap = wasSwapDay({
    completedProgramDayId: "day-a",
    scheduledProgramDayId: "day-a",
    completedActualType: "weights",
  });
  
  assert.ok(!wasSwap, "Should not be a swap when same program day");
  console.log("  ✓ Same day: not a swap");
}

console.log("\n✅ All post-swap collision resolution tests passed");
