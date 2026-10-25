import { resolveDisplayTarget } from "../src/lib/session/display-target";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`✓ ${label}`);
    passed++;
  } else {
    console.error(`✗ ${label}`);
    failed++;
  }
}

console.log("Testing display-target.ts logic\n");

// Test 1: timed exercise with current_target_reps=45 and planned 20-40 shows 45
const timedWithProgress = resolveDisplayTarget({
  metric: "seconds",
  plannedMin: 20,
  plannedMax: 40,
  currentTargetReps: 45,
});
check("timed exercise with current_target_reps=45 shows min=45", timedWithProgress.min === 45);
check("timed exercise with current_target_reps=45 shows max=45", timedWithProgress.max === 45);

// Test 2: timed exercise with null progress shows the planned value
const timedWithNullProgress = resolveDisplayTarget({
  metric: "seconds",
  plannedMin: 20,
  plannedMax: 40,
  currentTargetReps: null,
});
check("timed exercise with null progress shows planned min", timedWithNullProgress.min === 20);
check("timed exercise with null progress shows planned max", timedWithNullProgress.max === 40);

// Test 3: timed exercise with undefined progress shows the planned value
const timedWithUndefinedProgress = resolveDisplayTarget({
  metric: "seconds",
  plannedMin: 20,
  plannedMax: 40,
  currentTargetReps: undefined,
});
check("timed exercise with undefined progress shows planned min", timedWithUndefinedProgress.min === 20);
check("timed exercise with undefined progress shows planned max", timedWithUndefinedProgress.max === 40);

// Test 4: timed exercise with zero current_target_reps shows the planned value
const timedWithZeroProgress = resolveDisplayTarget({
  metric: "seconds",
  plannedMin: 20,
  plannedMax: 40,
  currentTargetReps: 0,
});
check("timed exercise with zero current_target_reps shows planned min", timedWithZeroProgress.min === 20);
check("timed exercise with zero current_target_reps shows planned max", timedWithZeroProgress.max === 40);

// Test 5: rep-based exercise with current_target_reps set is unchanged (uses planned)
const repsWithProgress = resolveDisplayTarget({
  metric: "reps",
  plannedMin: 8,
  plannedMax: 12,
  currentTargetReps: 45,
});
check("rep-based exercise ignores current_target_reps, shows planned min", repsWithProgress.min === 8);
check("rep-based exercise ignores current_target_reps, shows planned max", repsWithProgress.max === 12);

// Test 6: rep-based exercise with null progress uses planned values
const repsWithNullProgress = resolveDisplayTarget({
  metric: "reps",
  plannedMin: 8,
  plannedMax: 12,
  currentTargetReps: null,
});
check("rep-based exercise with null progress shows planned min", repsWithNullProgress.min === 8);
check("rep-based exercise with null progress shows planned max", repsWithNullProgress.max === 12);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
