/**
 * Test: New version hint component
 *
 * Verifies that the new version hint:
 * 1. Does NOT show on first install (no previous controller)
 * 2. Tracks hadController at mount to avoid false positives
 * 3. Has proper accessibility attributes (role="status", aria-label on dismiss)
 * 4. Has minimum 44px tap targets for Refresh button
 */

import * as fs from "fs";
import * as path from "path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testNewVersionHintComponent() {
  console.log("\n▶ Testing new version hint component...");

  const hintPath = path.join(__dirname, "..", "src", "components", "new-version-hint.tsx");
  
  assert(
    fs.existsSync(hintPath),
    "src/components/new-version-hint.tsx must exist"
  );

  const source = fs.readFileSync(hintPath, "utf-8");

  // Must track hadController at mount
  assert(
    source.includes("hadController") && source.includes("navigator.serviceWorker.controller"),
    "Component must track hadController at mount (!!navigator.serviceWorker.controller)"
  );

  // Must check hadController in controllerchange listener
  assert(
    source.includes("hadController") && source.includes("controllerchange"),
    "Component must check hadController in controllerchange listener"
  );

  // Must use hadController && !__reloadingForNewVersion condition
  assert(
    source.includes("hadController && !") || source.includes("hadController&&!"),
    "Component must check hadController before showing hint on controllerchange"
  );

  // Must have role="status" on hint container
  assert(
    source.includes('role="status"'),
    'Hint container must have role="status" for accessibility'
  );

  // Must have dismiss button with aria-label
  assert(
    source.includes('aria-label="Dismiss"') || source.includes("aria-label='Dismiss'"),
    'Dismiss button must have aria-label="Dismiss"'
  );

  // Must have minHeight 44px on Refresh button
  assert(
    source.includes('minHeight: "44px"') || source.includes("minHeight:'44px'"),
    "Refresh button must have minHeight: 44px tap target"
  );

  // Must have × close button
  assert(
    source.includes("×"),
    "Dismiss button must use × character"
  );

  console.log("  ✓ Tracks hadController at mount");
  console.log("  ✓ Checks hadController in controllerchange listener");
  console.log("  ✓ Only shows hint when hadController is true");
  console.log('  ✓ Has role="status" for accessibility');
  console.log('  ✓ Dismiss button has aria-label="Dismiss"');
  console.log("  ✓ Refresh button has minHeight: 44px tap target");
  console.log("  ✓ Dismiss button uses × character");
}

console.log("Testing New Version Hint Component");
console.log("==================================");

testNewVersionHintComponent();

console.log("\n✅ All new version hint tests passed\n");
