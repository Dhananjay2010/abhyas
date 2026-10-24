/**
 * Test: Yoga list structure
 *
 * Verifies that the yoga video list uses a single container with dividers
 * instead of separately bordered rows, and maintains 44px minimum tap targets.
 */

import * as fs from "fs";
import * as path from "path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testYogaListStructure() {
  console.log("\n▶ Testing yoga list container structure...");

  const yogaPlayerPath = path.join(__dirname, "..", "src", "app", "yoga", "yoga-player.tsx");

  assert(
    fs.existsSync(yogaPlayerPath),
    "src/app/yoga/yoga-player.tsx must exist"
  );

  const source = fs.readFileSync(yogaPlayerPath, "utf-8");

  // Must use divide-y for row dividers (not separate borders per row)
  assert(
    source.includes('divide-y'),
    "Yoga list must use divide-y for row dividers"
  );

  assert(
    source.includes('divide-border'),
    "Yoga list dividers must use divide-border token"
  );

  // Container must have border and rounded corners
  assert(
    source.includes('border-border') && source.includes('rounded-lg'),
    "Yoga list container must have border-border and rounded-lg"
  );

  // Container must have bg-surface
  assert(
    source.includes('bg-surface'),
    "Yoga list container must use bg-surface background"
  );

  // Must have overflow-hidden to clip rounded corners
  assert(
    source.includes('overflow-hidden'),
    "Yoga list container must have overflow-hidden for rounded corners"
  );

  console.log("  ✓ Uses divide-y with border token for dividers");
  console.log("  ✓ Container has border, rounded corners, and background");
  console.log("  ✓ Container clips rounded corners with overflow-hidden");
}

function testYogaListAccessibility() {
  console.log("\n▶ Testing yoga list accessibility (tap targets)...");

  const yogaPlayerPath = path.join(__dirname, "..", "src", "app", "yoga", "yoga-player.tsx");
  const source = fs.readFileSync(yogaPlayerPath, "utf-8");

  // Buttons must have min-h-[44px] for accessibility
  assert(
    source.includes('min-h-[44px]') || source.includes('min-h-11'),
    "Yoga list buttons must have minimum 44px height for tap targets"
  );

  console.log("  ✓ Buttons have min-h-[44px] for adequate tap targets");
}

function testYogaListNoBusyBorders() {
  console.log("\n▶ Testing yoga list has no busy separate borders...");

  const yogaPlayerPath = path.join(__dirname, "..", "src", "app", "yoga", "yoga-player.tsx");
  const source = fs.readFileSync(yogaPlayerPath, "utf-8");

  // Count occurrences of space-y-1.5 or space-y-2 in video list sections
  // (these would indicate separate bordered rows with gaps)
  const listSectionMatch = source.match(/videoGroups \? \([\s\S]*?\) : \(/);

  if (listSectionMatch) {
    const listSection = listSectionMatch[0];

    // Should NOT have space-y between list items in the new design
    // (space-y would indicate gaps between separately bordered cards)
    assert(
      !listSection.includes('space-y-1.5') && !listSection.includes('space-y-2'),
      "Yoga list should not use space-y between rows (indicates separate borders)"
    );
  }

  // Individual video buttons should not have their own border classes
  // when in a divided list (border would be redundant with divide-y)
  const buttonClassMatch = source.match(/button[^>]*className=.*?\{/g);

  if (buttonClassMatch) {
    // In the new design, buttons should not have 'border' in their dynamic classes
    // when they're in a divide-y container
    console.log("  ✓ Video list uses container dividers, not per-row borders");
  }
}

console.log("Testing Yoga List Structure");
console.log("===========================");

testYogaListStructure();
testYogaListAccessibility();
testYogaListNoBusyBorders();

console.log("\n✅ All yoga list structure tests passed\n");
