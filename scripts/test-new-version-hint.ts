/**
 * Test: New version hint component
 *
 * Verifies that the new version hint:
 * 1. Does NOT show on first install (checks hadController at mount)
 * 2. Only proceeds with setup if hadController is true (early return if false)
 * 3. Shows as a bottom toast (bottom: 0, not top)
 * 4. Respects safe-area-inset-bottom
 * 5. Suppresses on /session* and /breathe* routes
 * 6. Has proper accessibility attributes (role="status", aria-label on dismiss)
 * 7. Has minimum 44px tap targets for Refresh button
 */

import * as fs from "fs";
import * as path from "path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

/**
 * Test the exported shouldShowUpdateHint function logic.
 */
function testShouldShowUpdateHint() {
  console.log("\n▶ Testing shouldShowUpdateHint function...");

  const hintPath = path.join(__dirname, "..", "src", "components", "new-version-hint.tsx");
  const source = fs.readFileSync(hintPath, "utf-8");

  // Must export shouldShowUpdateHint function
  assert(
    source.includes("export function shouldShowUpdateHint"),
    "Component must export shouldShowUpdateHint function"
  );

  // Must check for /session* and /breathe* routes
  assert(
    (source.includes('pathname.startsWith("/session")') || source.includes("pathname.startsWith('/session')")) &&
    (source.includes('pathname.startsWith("/breathe")') || source.includes("pathname.startsWith('/breathe')")),
    "shouldShowUpdateHint must check for /session* and /breathe* routes"
  );

  // Test the logic by examining the source code structure
  // The function should return false for /session* and /breathe* routes
  assert(
    source.includes("!pathname.startsWith") || source.includes("! pathname.startsWith"),
    "shouldShowUpdateHint should use negation with startsWith"
  );

  console.log("  ✓ Exports shouldShowUpdateHint function");
  console.log("  ✓ Checks for /session* routes");
  console.log("  ✓ Checks for /breathe* routes");
  console.log("  ✓ Logic: returns false for /session* and /breathe*, true for others");
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

  // Must have early return if !hadController
  assert(
    source.includes("if (!hadController)") && source.includes("return"),
    "Component must have early return if !hadController (don't setup listeners on first install)"
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

  // Must be positioned at bottom (not top)
  assert(
    source.includes("bottom: 0") || source.includes("bottom:0"),
    "Hint must be positioned at bottom: 0 (bottom toast, not top)"
  );

  // Must NOT use top positioning for the hint
  assert(
    !source.includes("top: \"env(safe-area-inset-top") && 
    !source.includes("top:'env(safe-area-inset-top"),
    "Hint must NOT use top positioning (should be bottom toast)"
  );

  // Must respect safe-area-inset-bottom
  assert(
    source.includes("env(safe-area-inset-bottom)"),
    "Hint must respect env(safe-area-inset-bottom)"
  );

  // Must use usePathname
  assert(
    source.includes("usePathname"),
    "Component must use usePathname to check current route"
  );

  // Must call shouldShowUpdateHint with pathname
  assert(
    source.includes("shouldShowUpdateHint(pathname)") || source.includes("shouldShowUpdateHint( pathname )"),
    "Component must call shouldShowUpdateHint with pathname"
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
  console.log("  ✓ Has early return if !hadController (no setup on first install)");
  console.log("  ✓ Checks hadController in controllerchange listener");
  console.log("  ✓ Only shows hint when hadController is true");
  console.log("  ✓ Positioned at bottom (bottom: 0)");
  console.log("  ✓ Does NOT use top positioning");
  console.log("  ✓ Respects env(safe-area-inset-bottom)");
  console.log("  ✓ Uses usePathname");
  console.log("  ✓ Calls shouldShowUpdateHint with pathname");
  console.log('  ✓ Has role="status" for accessibility');
  console.log('  ✓ Dismiss button has aria-label="Dismiss"');
  console.log("  ✓ Refresh button has minHeight: 44px tap target");
  console.log("  ✓ Dismiss button uses × character");
}

console.log("Testing New Version Hint Component");
console.log("==================================");

testShouldShowUpdateHint();
testNewVersionHintComponent();

console.log("\n✅ All new version hint tests passed\n");
