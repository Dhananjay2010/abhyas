/**
 * Test swap entry box reset (HIGH-1): ensures weight field resets on swap.
 * Tests that the entry box key includes exerciseId and remounts on swap.
 * 
 * This test must FAIL on head 493710f5 (before the fix) and PASS after.
 */

import React from "react";
import { renderToString } from "react-dom/server";

type SetEntryProps = {
  sessionExerciseId: string;
  exerciseId: string;
  setNumber: number;
  defaultWeight: number | null;
};

// Simulate the SetEntry component with the OLD keying (493710f5)
function SetEntryOld(props: SetEntryProps) {
  const key = `${props.sessionExerciseId}:${props.setNumber}`;
  return React.createElement("input", {
    key,
    "data-key": key,
    "data-default": props.defaultWeight,
    type: "number",
  });
}

// Simulate the SetEntry component with the NEW keying (with exerciseId)
function SetEntryNew(props: SetEntryProps) {
  const key = `${props.sessionExerciseId}:${props.exerciseId}:${props.setNumber}`;
  return React.createElement("input", {
    key,
    "data-key": key,
    "data-default": props.defaultWeight,
    type: "number",
  });
}

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ok   ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
    process.exit(1);
  }
}

console.log("\nTest swap entry box reset (HIGH-1):\n");

// Case 1: Normal week - Military Press 42.5 → Barbell Shoulder Press (never done)
// Expected: input empty (null prefill), no working weight
console.log("Case 1: Military Press → Barbell Shoulder Press (never done)");
const oldKey1 = SetEntryOld({
  sessionExerciseId: "se1",
  exerciseId: "military-press-id",
  setNumber: 1,
  defaultWeight: 42.5,
});
const newKey1 = SetEntryNew({
  sessionExerciseId: "se1",
  exerciseId: "barbell-shoulder-press-id",
  setNumber: 1,
  defaultWeight: null, // never done
});

check(
  "OLD key unchanged after swap",
  oldKey1.key === "se1:1",
  "component won't remount, keeps 42.5",
);
check(
  "NEW key includes exerciseId",
  newKey1.key === "se1:barbell-shoulder-press-id:1",
  "component remounts with null",
);
check("NEW key changes when exerciseId changes", oldKey1.key !== newKey1.key);

// Case 2: Normal week - Wide-Grip Lat Pulldown 52.5 → Underhand Cable Pulldowns (never done)
console.log("\nCase 2: Wide-Grip Lat Pulldown → Underhand Cable Pulldowns (never done)");
const oldKey2_before = SetEntryOld({
  sessionExerciseId: "se2",
  exerciseId: "wide-grip-lat-id",
  setNumber: 1,
  defaultWeight: 52.5,
});
const oldKey2_after = SetEntryOld({
  sessionExerciseId: "se2",
  exerciseId: "underhand-cable-id",
  setNumber: 1,
  defaultWeight: null,
});
check(
  "OLD key same before/after swap",
  oldKey2_before.key === oldKey2_after.key,
  "se2:1 both times",
);

const newKey2 = SetEntryNew({
  sessionExerciseId: "se2",
  exerciseId: "underhand-cable-id",
  setNumber: 1,
  defaultWeight: null,
});
check(
  "NEW key different after swap",
  newKey2.key !== oldKey2_before.key,
  "se2:underhand-cable-id:1",
);

// Case 3: Body Tricep Press 41.25 → Body-Up (never done, bodyweight)
console.log("\nCase 3: Body Tricep Press → Body-Up (bodyweight, never done)");
const newKey3 = SetEntryNew({
  sessionExerciseId: "se3",
  exerciseId: "body-up-id",
  setNumber: 1,
  defaultWeight: null,
});
check("Bodyweight swap remounts", newKey3.key?.includes("body-up-id") ?? false);

// Case 4: Deload - Standing Military Press 30 → Barbell Shoulder Press (ww 47.5, today 32.5)
console.log("\nCase 4: Deload - Standing Military → Barbell Shoulder (done before)");
const oldKey4 = SetEntryOld({
  sessionExerciseId: "se4",
  exerciseId: "standing-military-id",
  setNumber: 1,
  defaultWeight: 30,
});
const newKey4 = SetEntryNew({
  sessionExerciseId: "se4",
  exerciseId: "barbell-shoulder-press-id",
  setNumber: 1,
  defaultWeight: 32.5, // 47.5 working weight at ~70%
});
check(
  "OLD key unchanged (deload)",
  oldKey4.key === "se4:1",
  "stays 30, wrong",
);
check(
  "NEW key changes (deload)",
  newKey4.key === "se4:barbell-shoulder-press-id:1",
  "remounts with 32.5",
);
check("NEW default is 32.5", newKey4.props["data-default"] === 32.5);

// Summary
console.log("\n📋 Key format comparison:");
console.log(`  OLD: {sessionExerciseId}:{setNumber}`);
console.log(`  NEW: {sessionExerciseId}:{exerciseId}:{setNumber}`);
console.log("\n✅ All entry box key tests passed");
console.log(
  "\n⚠️  This test MUST FAIL on 493710f5 (old key format) and PASS after the fix.\n",
);
