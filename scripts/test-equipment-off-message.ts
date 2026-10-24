#!/usr/bin/env tsx
/**
 * Tests for equipment off confirmation message helper.
 * 
 * Tests the pure helper that returns the appropriate confirmation message
 * when turning off "I have access to everything".
 */

import { getEquipmentOffMessage } from "../src/app/settings/equipment-logic";

let failures = 0;

function testMessage(
  description: string,
  wasSaved: boolean,
  expected: string
) {
  const actual = getEquipmentOffMessage(wasSaved);
  
  if (actual !== expected) {
    console.error(`❌ ${description}`);
    console.error(`   expected: "${expected}"`);
    console.error(`   actual:   "${actual}"`);
    failures++;
    return;
  }
  
  console.log(`✓ ${description}`);
}

console.log("Testing equipment off confirmation messages...\n");

testMessage(
  "Message when equipment was saved",
  true,
  "Saved. Your plan will use only the equipment you pick."
);

testMessage(
  "Message when showing picker without save",
  false,
  "Showing your saved equipment. Pick what you have."
);

console.log(
  `\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All tests passed" : `${failures} test(s) failed`}`
);
process.exit(failures === 0 ? 0 : 1);
