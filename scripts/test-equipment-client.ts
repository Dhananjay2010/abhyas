#!/usr/bin/env tsx
/**
 * Tests for client-side equipment UI decision logic.
 * 
 * Tests the pure helper that decides whether to allow equipment UI changes
 * and when to show hints instead of calling the server.
 */

import { decideClientEquipmentUpdate } from "../src/app/settings/equipment-logic";

let failures = 0;

function testClientDecision(
  description: string,
  input: {
    currentHasAll: boolean;
    currentEquipmentIds: string[];
    action: "toggle" | "chip-click";
    chipId?: string;
  },
  expected:
    | { allow: true; newHasAll: boolean; newEquipmentIds: string[] }
    | { allow: false; hint: string }
) {
  const actual = decideClientEquipmentUpdate(input);
  
  if (actual.allow !== expected.allow) {
    console.error(`❌ ${description} - allow mismatch`);
    console.error(`   expected: ${expected.allow}`);
    console.error(`   actual:   ${actual.allow}`);
    failures++;
    return;
  }
  
  if (!actual.allow && !expected.allow) {
    if (actual.hint !== expected.hint) {
      console.error(`❌ ${description} - hint mismatch`);
      console.error(`   expected: "${expected.hint}"`);
      console.error(`   actual:   "${actual.hint}"`);
      failures++;
      return;
    }
  }
  
  if (actual.allow && expected.allow) {
    if (actual.newHasAll !== expected.newHasAll) {
      console.error(`❌ ${description} - newHasAll mismatch`);
      console.error(`   expected: ${expected.newHasAll}`);
      console.error(`   actual:   ${actual.newHasAll}`);
      failures++;
      return;
    }
    
    const actualIds = JSON.stringify([...actual.newEquipmentIds].sort());
    const expectedIds = JSON.stringify([...expected.newEquipmentIds].sort());
    
    if (actualIds !== expectedIds) {
      console.error(`❌ ${description} - newEquipmentIds mismatch`);
      console.error(`   expected: ${expectedIds}`);
      console.error(`   actual:   ${actualIds}`);
      failures++;
      return;
    }
  }
  
  console.log(`✓ ${description}`);
}

console.log("Testing client-side equipment UI decisions...\n");

// Toggle OFF with empty equipment - don't save, show neutral hint
testClientDecision(
  "Toggle OFF with empty equipment - shows neutral hint",
  {
    currentHasAll: true,
    currentEquipmentIds: [],
    action: "toggle",
  },
  {
    allow: false,
    hint: "Pick what you have, and we'll update your plan.",
  }
);

// Toggle OFF with equipment - allow
testClientDecision(
  "Toggle OFF with existing equipment - allow",
  {
    currentHasAll: true,
    currentEquipmentIds: ["barbell", "dumbbell"],
    action: "toggle",
  },
  {
    allow: true,
    newHasAll: false,
    newEquipmentIds: ["barbell", "dumbbell"],
  }
);

// Toggle ON - always allow
testClientDecision(
  "Toggle ON with empty equipment - allow",
  {
    currentHasAll: false,
    currentEquipmentIds: [],
    action: "toggle",
  },
  {
    allow: true,
    newHasAll: true,
    newEquipmentIds: [],
  }
);

testClientDecision(
  "Toggle ON with equipment - allow",
  {
    currentHasAll: false,
    currentEquipmentIds: ["barbell"],
    action: "toggle",
  },
  {
    allow: true,
    newHasAll: true,
    newEquipmentIds: ["barbell"],
  }
);

// Deselecting last chip - don't allow, show hint
testClientDecision(
  "Deselect last chip - shows hint",
  {
    currentHasAll: false,
    currentEquipmentIds: ["barbell"],
    action: "chip-click",
    chipId: "barbell",
  },
  {
    allow: false,
    hint: 'Keep at least one, or turn on "I have access to everything".',
  }
);

// Deselecting non-last chip - allow
testClientDecision(
  "Deselect non-last chip - allow",
  {
    currentHasAll: false,
    currentEquipmentIds: ["barbell", "dumbbell"],
    action: "chip-click",
    chipId: "barbell",
  },
  {
    allow: true,
    newHasAll: false,
    newEquipmentIds: ["dumbbell"],
  }
);

// Selecting a chip - always allow
testClientDecision(
  "Select new chip - allow",
  {
    currentHasAll: false,
    currentEquipmentIds: ["barbell"],
    action: "chip-click",
    chipId: "dumbbell",
  },
  {
    allow: true,
    newHasAll: false,
    newEquipmentIds: ["barbell", "dumbbell"],
  }
);

testClientDecision(
  "Select first chip from empty - allow",
  {
    currentHasAll: false,
    currentEquipmentIds: [],
    action: "chip-click",
    chipId: "barbell",
  },
  {
    allow: true,
    newHasAll: false,
    newEquipmentIds: ["barbell"],
  }
);

// Edge cases
testClientDecision(
  "Selecting an already selected chip (other than last) - allow deselect",
  {
    currentHasAll: false,
    currentEquipmentIds: ["barbell", "dumbbell", "kettlebell"],
    action: "chip-click",
    chipId: "dumbbell",
  },
  {
    allow: true,
    newHasAll: false,
    newEquipmentIds: ["barbell", "kettlebell"],
  }
);

testClientDecision(
  "Clicking a chip when hasAll is true (shouldn't happen in UI but handle it) - allow",
  {
    currentHasAll: true,
    currentEquipmentIds: [],
    action: "chip-click",
    chipId: "barbell",
  },
  {
    allow: true,
    newHasAll: false,
    newEquipmentIds: ["barbell"],
  }
);

console.log(
  `\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All tests passed" : `${failures} test(s) failed`}`
);
process.exit(failures === 0 ? 0 : 1);
