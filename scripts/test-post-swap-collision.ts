/**
 * Test: Post-swap collision resolution behavior
 * 
 * Tests the core logic that after a swap where tomorrow's scheduled day 
 * equals the day just done, the system serves the next in rotation.
 * 
 * Run: npx tsx scripts/test-post-swap-collision.ts
 */

import { strict as assert } from "node:assert";

console.log("Test: Post-swap collision resolution\n");

/**
 * Core collision resolution logic extracted for testing.
 * When today was a swap AND tomorrow would repeat the same workout,
 * serve the next one in the rotation instead.
 */
function resolvePostSwapCollision({
  wasSwap,
  todayProgramDayId,
  tomorrowProgramDayId,
  trainingDays,
}: {
  wasSwap: boolean;
  todayProgramDayId: string;
  tomorrowProgramDayId: string | null;
  trainingDays: Array<{ id: string; label: string }>;
}): { shouldResolve: boolean; nextLabel?: string } {
  if (!wasSwap) return { shouldResolve: false };
  if (todayProgramDayId !== tomorrowProgramDayId) return { shouldResolve: false };
  
  const currentIndex = trainingDays.findIndex(d => d.id === todayProgramDayId);
  if (currentIndex < 0) return { shouldResolve: false };
  
  const nextIndex = (currentIndex + 1) % trainingDays.length;
  const nextDay = trainingDays[nextIndex];
  
  return { shouldResolve: true, nextLabel: nextDay.label };
}

console.log("1. Swap with collision: serves next in rotation");
{
  const trainingDays = [
    { id: "upper-1", label: "Upper" },
    { id: "lower-1", label: "Lower" },
  ];

  const result = resolvePostSwapCollision({
    wasSwap: true,
    todayProgramDayId: "lower-1",
    tomorrowProgramDayId: "lower-1", // collision!
    trainingDays,
  });

  assert.ok(result.shouldResolve, "Should resolve collision");
  assert.equal(result.nextLabel, "Upper", "Next in rotation is Upper");
  console.log("  ✓ Collision resolved: serves Upper");
}

console.log("\n2. Normal day (no swap): no collision resolution");
{
  const trainingDays = [
    { id: "day-a", label: "Full Body A" },
    { id: "day-b", label: "Full Body B" },
  ];

  const result = resolvePostSwapCollision({
    wasSwap: false,
    todayProgramDayId: "day-a",
    tomorrowProgramDayId: "day-a",
    trainingDays,
  });

  assert.ok(!result.shouldResolve, "Should not resolve (not a swap)");
  console.log("  ✓ No swap: no collision resolution");
}

console.log("\n3. Swap to different workout: no collision");
{
  const trainingDays = [
    { id: "day-a", label: "Full Body A" },
    { id: "day-b", label: "Full Body B" },
    { id: "day-c", label: "Full Body C" },
  ];

  const result = resolvePostSwapCollision({
    wasSwap: true,
    todayProgramDayId: "day-c",
    tomorrowProgramDayId: null, // Rest day tomorrow
    trainingDays,
  });

  assert.ok(!result.shouldResolve, "Should not resolve (different tomorrow)");
  console.log("  ✓ Swap to different workout: no collision");
}

console.log("\n4. Wraps around rotation");
{
  const trainingDays = [
    { id: "day-a", label: "Full Body A" },
    { id: "day-b", label: "Full Body B" },
    { id: "day-c", label: "Full Body C" },
  ];

  // Did day-c (last), tomorrow is also day-c
  const result = resolvePostSwapCollision({
    wasSwap: true,
    todayProgramDayId: "day-c",
    tomorrowProgramDayId: "day-c",
    trainingDays,
  });

  assert.ok(result.shouldResolve, "Should resolve collision");
  assert.equal(result.nextLabel, "Full Body A", "Wraps to first");
  console.log("  ✓ Wraps around: day-c → day-a");
}

console.log("\n✅ All post-swap collision resolution tests passed");
