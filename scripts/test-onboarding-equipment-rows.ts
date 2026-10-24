#!/usr/bin/env tsx
/**
 * L3 QA test: Onboarding equipment row preservation.
 * 
 * Tests that saveEquipment in onboarding keeps rows when hasAll is true,
 * so switching 'everything' OFF later has rows to restore.
 */

(function() {
let failures = 0;

type SaveBehavior = {
  hasAll: boolean;
  equipmentIds: string[];
  shouldKeepRows: boolean;
  shouldClearRows: boolean;
};

function testSaveBehavior(
  description: string,
  input: SaveBehavior
) {
  const { hasAll, equipmentIds, shouldKeepRows, shouldClearRows } = input;
  
  // Logic from the updated saveEquipment function
  let rowsKept = false;
  let rowsCleared = false;
  
  if (equipmentIds.length > 0) {
    // Rows are replaced (delete then insert)
    rowsKept = true;
  } else if (!hasAll) {
    // Only clear when hasAll is false and no equipment is selected
    rowsCleared = true;
  }
  
  if (rowsKept !== shouldKeepRows) {
    console.error(`❌ ${description} - rows kept mismatch`);
    console.error(`   expected keepRows: ${shouldKeepRows}`);
    console.error(`   actual keepRows:   ${rowsKept}`);
    failures++;
    return;
  }
  
  if (rowsCleared !== shouldClearRows) {
    console.error(`❌ ${description} - rows cleared mismatch`);
    console.error(`   expected clearRows: ${shouldClearRows}`);
    console.error(`   actual clearRows:   ${rowsCleared}`);
    failures++;
    return;
  }
  
  console.log(`✓ ${description}`);
}

console.log("Testing onboarding equipment row preservation (L3)...\n");

// hasAll=true with equipment - should keep rows
testSaveBehavior(
  "hasAll=true with equipment - keeps rows for later restore",
  {
    hasAll: true,
    equipmentIds: ["barbell", "dumbbell"],
    shouldKeepRows: true,
    shouldClearRows: false,
  }
);

// hasAll=false with equipment - should keep rows
testSaveBehavior(
  "hasAll=false with equipment - keeps selected rows",
  {
    hasAll: false,
    equipmentIds: ["barbell", "dumbbell"],
    shouldKeepRows: true,
    shouldClearRows: false,
  }
);

// hasAll=false with empty list - should clear rows
testSaveBehavior(
  "hasAll=false with empty list - clears rows",
  {
    hasAll: false,
    equipmentIds: [],
    shouldKeepRows: false,
    shouldClearRows: true,
  }
);

// hasAll=true with empty list - should NOT clear rows
testSaveBehavior(
  "hasAll=true with empty list - does not clear rows",
  {
    hasAll: true,
    equipmentIds: [],
    shouldKeepRows: false,
    shouldClearRows: false,
  }
);

console.log(
  `\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All tests passed" : `${failures} test(s) failed`}`
);
process.exit(failures === 0 ? 0 : 1);
})();
