#!/usr/bin/env tsx
/**
 * Test rebuild confirmation bottom sheet positioning at 390px.
 *
 * QA item: at 390px the rebuild confirm opened mostly under the bottom nav,
 * with buttons half hidden. Now it's a bottom sheet above the nav with
 * z-index 40, bottom offset 68px (nav height) + safe-area-inset-bottom,
 * and buttons at min-height 44px.
 *
 * Run: npm run test:rebuild-bottom-sheet
 */

import { readFileSync } from "fs";
import { join } from "path";

const buildPlanButtonPath = join(
  process.cwd(),
  "src/app/today/build-plan-button.tsx"
);
const source = readFileSync(buildPlanButtonPath, "utf-8");

let passed = 0;
let failed = 0;

function test(name: string, fn: () => boolean) {
  if (fn()) {
    console.log(`✓ ${name}`);
    passed++;
  } else {
    console.log(`✗ ${name}`);
    failed++;
  }
}

// Test 1: Confirmation dialog has fixed positioning with z-index 40
test("Confirmation dialog has fixed positioning with z-40", () => {
  return source.includes('className="fixed inset-x-0 z-40');
});

// Test 2: Bottom offset includes nav height and safe-area-inset-bottom
test("Bottom offset accounts for nav height + safe-area-inset", () => {
  const hasBottomCalc = source.includes('bottom: "calc(68px + env(safe-area-inset-bottom))"');
  return hasBottomCalc;
});

// Test 3: Both buttons have min-height 44px
test("Both buttons have min-height 44px", () => {
  const hasMinHeight = source.match(/style={{.*minHeight:.*"44px".*}}/g);
  return hasMinHeight !== null && hasMinHeight.length >= 2;
});

// Test 4: Dialog has shadow for elevation
test("Dialog has shadow-lg for elevation", () => {
  return source.includes("shadow-lg");
});

// Test 5: Success state shows role="status" with aria-live
test("Success state has role=status with aria-live=polite", () => {
  const hasSuccessStatus = 
    source.includes('role="status"') &&
    source.includes('aria-live="polite"') &&
    source.includes("Plan rebuilt");
  return hasSuccessStatus;
});

// Test 6: Week text uses "You stay in Week N" format
test("Week text says 'You stay in Week N of this block'", () => {
  return source.includes("You stay in Week") && source.includes("of this block");
});

// Test 7: Button grid uses grid-cols-2 for equal width
test("Buttons use grid-cols-2 for equal width", () => {
  return source.includes("grid grid-cols-2 gap-2");
});

// Test 8: router.refresh() called after successful rebuild
test("router.refresh() called after successful rebuild", () => {
  return source.includes("router.refresh()");
});

// Test 9: onSuccess callback still supported
test("onSuccess callback is called after rebuild", () => {
  return source.includes("if (onSuccess) onSuccess()");
});

// Test 10: showSuccessState prop controls success message
test("showSuccessState prop controls success display", () => {
  return (
    source.includes("showSuccessState?: boolean") &&
    source.includes("if (showSuccessState)")
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
