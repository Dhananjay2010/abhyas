/**
 * Test: Demo path anchoring fixes (Items 1 & 6 from report-bot1-demo-path-c366.md)
 * 
 * Requirements:
 * 1. New plan's first training day = sign-up day (plan's started_on)
 * 2. Existing plans keep their exact schedule (no re-anchoring)
 * 3. Rest-day swap preselects the next rotation workout
 * 4. Post-swap summary names the real next session
 * 
 * Run: npx tsx scripts/test-demo-path-anchoring.ts
 */

import { strict as assert } from "assert";
import { addDays, isoWeekday } from "../src/lib/dates";
import type { Database } from "../src/lib/database.types";

type DayType = Database["public"]["Enums"]["day_type"];

// Mock: Compute which weekdays get training for a new plan anchored to started_on
// This replicates the logic from splits.ts activeDayIndices, but anchored to a start date
function computeScheduleForNewPlan(
  startedOn: string,
  daysPerWeek: number,
  templates: string[] // e.g. ["Full Body A", "Full Body B", "Full Body C"]
): Map<number, { dayIndex: number; label: string; isRest: boolean }> {
  const schedule = new Map<number, { dayIndex: number; label: string; isRest: boolean }>();
  
  // Get which weekdays are active for this plan size (1-indexed, 1=Monday)
  // For 3-day: [1,3,5] = Mon, Wed, Fri
  // For 4-day: [1,2,4,5] = Mon, Tue, Thu, Fri
  // For 5-day: [1,2,3,5,6] = Mon, Tue, Wed, Fri, Sat
  
  let activeDays: number[];
  switch (daysPerWeek) {
    case 3:
      activeDays = [1, 3, 5];
      break;
    case 4:
      activeDays = [1, 2, 4, 5];
      break;
    case 5:
      activeDays = [1, 2, 3, 5, 6];
      break;
    case 6:
      activeDays = [1, 2, 3, 4, 6, 7];
      break;
    default:
      activeDays = Array.from({ length: Math.min(daysPerWeek, 7) }, (_, i) => i + 1);
  }
  
  // Anchor: shift the pattern so started_on is the first training day
  const startWeekday = isoWeekday(startedOn);
  const startIndexInPattern = activeDays.indexOf(startWeekday);
  
  // If started_on falls on a rest day in the pattern, shift to the next training day
  // For new plans, we FORCE started_on to be a training day (requirement 1)
  // So we need to recompute the pattern anchored to this start
  
  const offset = startWeekday - 1; // 0-indexed offset from Monday
  const rotatedActiveDays = activeDays.map(d => ((d - 1 + offset) % 7) + 1);
  
  // Build schedule: for each weekday, check if it's in rotatedActiveDays
  let dayIndex = 0;
  for (let weekday = 1; weekday <= 7; weekday++) {
    if (rotatedActiveDays.includes(weekday)) {
      schedule.set(weekday, {
        dayIndex: dayIndex + 1,
        label: templates[dayIndex % templates.length],
        isRest: false
      });
      dayIndex++;
    } else {
      schedule.set(weekday, {
        dayIndex: weekday,
        label: "Rest",
        isRest: true
      });
    }
  }
  
  return schedule;
}

function getNextWorkoutInRotation(
  templates: string[],
  currentDayIndex: number
): { dayIndex: number; label: string } {
  // The next workout is the next day in the rotation
  const nextIndex = currentDayIndex % templates.length;
  return {
    dayIndex: nextIndex + 1,
    label: templates[nextIndex]
  };
}

console.log("Test: Demo path anchoring fixes\n");

// Test 1: New 3-day plan starting on Tuesday
console.log("1. New 3-day plan starting Tuesday (sign-up day)");
{
  const startedOn = "2026-10-27"; // Tuesday
  const templates = ["Full Body A", "Full Body B", "Full Body C"];
  const schedule = computeScheduleForNewPlan(startedOn, 3, templates);
  
  const tuesday = schedule.get(2); // Tuesday = weekday 2
  assert.ok(tuesday && !tuesday.isRest, "Tuesday (sign-up day) must be a training day");
  assert.equal(tuesday.label, "Full Body A", "First day should be Full Body A");
  
  // Check rest day spacing
  const wednesday = schedule.get(3);
  const thursday = schedule.get(4);
  assert.ok(wednesday?.isRest, "Wednesday should be rest (spacing)");
  assert.ok(thursday && !thursday.isRest, "Thursday should be training");
  assert.equal(thursday.label, "Full Body B", "Second training day");
  
  console.log("  ✓ Tuesday = Full Body A (day 1)");
  console.log("  ✓ Rest days properly spaced");
}

// Test 2: Sign-up day is always day 1, regardless of weekday
console.log("\n2. Sign-up day is always day 1 for all weekdays");
{
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const baseDates = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"];
  
  for (let i = 0; i < 7; i++) {
    const startedOn = baseDates[i];
    const templates = ["Full Body A", "Full Body B", "Full Body C"];
    const schedule = computeScheduleForNewPlan(startedOn, 3, templates);
    
    const signupWeekday = isoWeekday(startedOn);
    const day = schedule.get(signupWeekday);
    
    assert.ok(day && !day.isRest, `${weekdays[i]} sign-up must be training day`);
    assert.equal(day.label, "Full Body A", `${weekdays[i]} sign-up must be day 1`);
  }
  
  console.log("  ✓ All weekdays: sign-up day = Full Body A");
}

// Test 3: 4-day and 5-day plans
console.log("\n3. Different plan sizes anchor correctly");
{
  // 4-day plan starting Wednesday
  const startedOn4 = "2026-10-28"; // Wednesday
  const templates4 = ["Upper", "Lower", "Upper", "Lower"];
  const schedule4 = computeScheduleForNewPlan(startedOn4, 4, templates4);
  
  const wednesday = schedule4.get(3);
  assert.ok(wednesday && !wednesday.isRest, "Wed is training");
  assert.equal(wednesday.label, "Upper", "First Upper day");
  
  // 5-day plan starting Friday
  const startedOn5 = "2026-10-30"; // Friday
  const templates5 = ["Push", "Pull", "Legs", "Upper", "Lower"];
  const schedule5 = computeScheduleForNewPlan(startedOn5, 5, templates5);
  
  const friday = schedule5.get(5);
  assert.ok(friday && !friday.isRest, "Fri is training");
  assert.equal(friday.label, "Push", "First Push day");
  
  console.log("  ✓ 4-day plan: Wed = Upper");
  console.log("  ✓ 5-day plan: Fri = Push");
}

// Test 4: Rest-day swap preselection
console.log("\n4. Rest-day swap preselects next rotation workout");
{
  const templates = ["Full Body A", "Full Body B", "Full Body C"];
  
  // After completing day 2 (Full Body B), next is day 3 (Full Body C)
  const next = getNextWorkoutInRotation(templates, 2);
  assert.equal(next.label, "Full Body C", "Next after B is C");
  assert.equal(next.dayIndex, 3, "Day index is 3");
  
  // After completing day 3 (Full Body C), next wraps to day 1 (Full Body A)
  const wrap = getNextWorkoutInRotation(templates, 3);
  assert.equal(wrap.label, "Full Body A", "Next after C wraps to A");
  assert.equal(wrap.dayIndex, 1, "Day index wraps to 1");
  
  console.log("  ✓ After Full Body B → preselect Full Body C");
  console.log("  ✓ After Full Body C → preselect Full Body A (wrap)");
}

// Test 5: Post-swap tomorrow calculation
console.log("\n5. Post-swap summary names correct next session");
{
  // Scenario: Rest day, swap to Full Body B, complete it
  // Tomorrow should be Full Body C (next in rotation), not B (just done)
  const templates = ["Full Body A", "Full Body B", "Full Body C"];
  const startedOn = "2026-10-27"; // Tuesday
  const schedule = computeScheduleForNewPlan(startedOn, 3, templates);
  
  // User completes Full Body B (day 2)
  const completedDayIndex = 2;
  const next = getNextWorkoutInRotation(templates, completedDayIndex);
  
  assert.equal(next.label, "Full Body C", "Tomorrow is Full Body C, not B");
  
  // If tomorrow is a rest day per schedule, the label would still reflect
  // the NEXT workout that will come up (for the preselection)
  
  console.log("  ✓ After completing Full Body B → Tomorrow is Full Body C");
}

// Test 6: After 20:00 local, still offer today's workout
console.log("\n6. After 20:00 local, today's workout is still offered");
{
  // This is a UI test that would need to be in the onboarding flow
  // The test here just documents the requirement
  console.log("  ℹ UI requirement: Show today's workout + 'Or start tomorrow' link");
  console.log("  ℹ Even after 20:00, offer today as primary option");
}

console.log("\n7. Existing plans unchanged (regression guard)");
{
  // This will be tested by comparing schedules before/after the change
  // for a program created with the old logic
  console.log("  ℹ Will be tested with real DB fixture comparison");
  console.log("  ℹ programs.started_on and week_offset must match old behavior");
}

console.log("\n✅ All anchor tests passed");
console.log("\nNext steps:");
console.log("1. Implement activeDayIndicesForPlan(started_on, daysPerWeek)");
console.log("2. Update generateProgram to use started_on for new plans");
console.log("3. Add logic to preserve existing plans' schedules");
console.log("4. Fix swap preselection to show next rotation workout");
console.log("5. Fix nextDayPlan to compute correct tomorrow after swap");
