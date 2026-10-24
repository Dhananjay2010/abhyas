#!/usr/bin/env tsx
/**
 * Tests for equipment toggle decision logic.
 * 
 * Tests the pure helper that decides whether to write, skip, or error when
 * updating equipment settings, ensuring:
 * - Toggle ON preserves equipment rows (server keeps them)
 * - Toggle OFF with saved picks restores them
 * - Empty list with hasAll false is rejected
 * - No change means no writes and no stale flag
 */

import { decideEquipmentUpdate } from "../src/app/settings/equipment-logic";

let failures = 0;

function testDecision(
  description: string,
  input: {
    currentHasAll: boolean;
    currentEquipmentIds: string[];
    newHasAll: boolean;
    newEquipmentIds: string[];
  },
  expected: { action: "write"; changed: boolean } | { action: "skip" } | { action: "error"; error: string }
) {
  const actual = decideEquipmentUpdate(input);
  
  if (actual.action !== expected.action) {
    console.error(`❌ ${description} - action mismatch`);
    console.error(`   expected: ${expected.action}`);
    console.error(`   actual:   ${actual.action}`);
    failures++;
    return;
  }
  
  if (actual.action === "error" && expected.action === "error") {
    if (actual.error !== expected.error) {
      console.error(`❌ ${description} - error message mismatch`);
      console.error(`   expected: "${expected.error}"`);
      console.error(`   actual:   "${actual.error}"`);
      failures++;
      return;
    }
  }
  
  if (actual.action === "write" && expected.action === "write") {
    if (actual.changed !== expected.changed) {
      console.error(`❌ ${description} - changed flag mismatch`);
      console.error(`   expected: ${expected.changed}`);
      console.error(`   actual:   ${actual.changed}`);
      failures++;
      return;
    }
  }
  
  console.log(`✓ ${description}`);
}

console.log("Testing equipment update decision logic...\n");

// Toggle ON - keeps rows, marks as changed
testDecision(
  "Toggle ON with existing equipment - keeps rows, marks changed",
  {
    currentHasAll: false,
    currentEquipmentIds: ["barbell", "dumbbell"],
    newHasAll: true,
    newEquipmentIds: ["barbell", "dumbbell"],
  },
  { action: "write", changed: true }
);

// Toggle OFF with saved picks - restores them
testDecision(
  "Toggle OFF restores saved equipment - marks changed",
  {
    currentHasAll: true,
    currentEquipmentIds: ["barbell", "dumbbell"],
    newHasAll: false,
    newEquipmentIds: ["barbell", "dumbbell"],
  },
  { action: "write", changed: true }
);

// Empty list with hasAll false - rejected
testDecision(
  "Empty list with hasAll false - rejected with error",
  {
    currentHasAll: false,
    currentEquipmentIds: ["barbell"],
    newHasAll: false,
    newEquipmentIds: [],
  },
  { 
    action: "error", 
    error: 'Pick at least one item, or turn on "I have access to everything".' 
  }
);

testDecision(
  "Toggle OFF with empty list - rejected with error",
  {
    currentHasAll: true,
    currentEquipmentIds: [],
    newHasAll: false,
    newEquipmentIds: [],
  },
  { 
    action: "error", 
    error: 'Pick at least one item, or turn on "I have access to everything".' 
  }
);

// No change - skip
testDecision(
  "No change with hasAll true - skip",
  {
    currentHasAll: true,
    currentEquipmentIds: ["barbell", "dumbbell"],
    newHasAll: true,
    newEquipmentIds: ["barbell", "dumbbell"],
  },
  { action: "skip" }
);

testDecision(
  "No change with hasAll false - skip",
  {
    currentHasAll: false,
    currentEquipmentIds: ["barbell", "dumbbell"],
    newHasAll: false,
    newEquipmentIds: ["barbell", "dumbbell"],
  },
  { action: "skip" }
);

testDecision(
  "Same equipment, different order - skip (no change)",
  {
    currentHasAll: false,
    currentEquipmentIds: ["barbell", "dumbbell", "kettlebell"],
    newHasAll: false,
    newEquipmentIds: ["kettlebell", "barbell", "dumbbell"],
  },
  { action: "skip" }
);

// Equipment changes
testDecision(
  "Adding equipment - marks changed",
  {
    currentHasAll: false,
    currentEquipmentIds: ["barbell"],
    newHasAll: false,
    newEquipmentIds: ["barbell", "dumbbell"],
  },
  { action: "write", changed: true }
);

testDecision(
  "Removing equipment - marks changed",
  {
    currentHasAll: false,
    currentEquipmentIds: ["barbell", "dumbbell"],
    newHasAll: false,
    newEquipmentIds: ["barbell"],
  },
  { action: "write", changed: true }
);

testDecision(
  "Replacing equipment - marks changed",
  {
    currentHasAll: false,
    currentEquipmentIds: ["barbell", "dumbbell"],
    newHasAll: false,
    newEquipmentIds: ["kettlebell", "pullupbar"],
  },
  { action: "write", changed: true }
);

// Edge cases
testDecision(
  "Toggle ON with empty equipment - marks changed",
  {
    currentHasAll: false,
    currentEquipmentIds: [],
    newHasAll: true,
    newEquipmentIds: [],
  },
  { action: "write", changed: true }
);

testDecision(
  "Repeatedly toggling ON - skip if already on",
  {
    currentHasAll: true,
    currentEquipmentIds: ["barbell"],
    newHasAll: true,
    newEquipmentIds: ["barbell"],
  },
  { action: "skip" }
);

console.log(
  `\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All tests passed" : `${failures} test(s) failed`}`
);
process.exit(failures === 0 ? 0 : 1);

export {};
