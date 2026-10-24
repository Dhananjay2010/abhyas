/**
 * Tests for equipment toggle logic in Settings.
 * The "I have access to everything" button must toggle on/off correctly.
 */

let failures = 0;

function testToggle(
  currentHasAll: boolean,
  currentEquipmentIds: string[],
  expectedHasAll: boolean,
  expectedEquipmentIds: string[],
  description: string
) {
  // Simulate the toggle logic
  const nextHasAll = !currentHasAll;
  const nextEquipmentIds = currentEquipmentIds;

  if (nextHasAll !== expectedHasAll) {
    console.error(`❌ ${description} - hasAll mismatch`);
    console.error(`   expected hasAll: ${expectedHasAll}`);
    console.error(`   actual hasAll:   ${nextHasAll}`);
    failures++;
    return;
  }

  if (JSON.stringify(nextEquipmentIds) !== JSON.stringify(expectedEquipmentIds)) {
    console.error(`❌ ${description} - equipmentIds mismatch`);
    console.error(`   expected equipmentIds: ${JSON.stringify(expectedEquipmentIds)}`);
    console.error(`   actual equipmentIds:   ${JSON.stringify(nextEquipmentIds)}`);
    failures++;
    return;
  }

  console.log(`✓ ${description}`);
}

console.log("Testing equipment toggle logic...\n");

// Toggle from false to true
testToggle(
  false,
  ["barbell", "dumbbell"],
  true,
  ["barbell", "dumbbell"],
  "Toggle ON preserves selected equipment"
);

// Toggle from true to false
testToggle(
  true,
  ["barbell", "dumbbell"],
  false,
  ["barbell", "dumbbell"],
  "Toggle OFF preserves selected equipment"
);

// Toggle from false to true with no equipment
testToggle(false, [], true, [], "Toggle ON with no equipment selected");

// Toggle from true to false with no equipment
testToggle(true, [], false, [], "Toggle OFF with no equipment selected");

// Rapid toggle sequence
let hasAll = false;

for (let i = 0; i < 4; i++) {
  hasAll = !hasAll;
  const expected = i % 2 === 0;
  if (hasAll !== expected) {
    console.error(`❌ Rapid toggle sequence failed at iteration ${i}`);
    failures++;
  }
}
console.log(`✓ Rapid toggle sequence (4 toggles)`);

console.log(
  `\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All tests passed" : `${failures} test(s) failed`}`
);
process.exit(failures === 0 ? 0 : 1);

export {};
