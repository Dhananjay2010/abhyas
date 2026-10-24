/**
 * Test: Error boundary retry behavior
 *
 * Verifies that the in-app error boundary's "Try again" button
 * behaves like the /offline Retry button when showing an offline error:
 * - Shows "Checking…" state
 * - Pings connectivity
 * - Reloads/resets on success or shows "Still offline"
 * - No layout shift when showing/hiding feedback
 */

import * as fs from "fs";
import * as path from "path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testErrorBoundaryRetryBehavior() {
  console.log("\n▶ Testing error boundary retry behavior...");

  const errorPath = path.join(__dirname, "..", "src", "app", "error.tsx");
  
  assert(
    fs.existsSync(errorPath),
    "src/app/error.tsx must exist"
  );

  const source = fs.readFileSync(errorPath, "utf-8");

  // Must import determineRetryAction from offline-retry-logic
  assert(
    source.includes("determineRetryAction") && source.includes("@/lib/offline-retry-logic"),
    "error.tsx must import determineRetryAction from @/lib/offline-retry-logic"
  );

  // Must have checking state
  assert(
    source.includes("useState(false)") && (source.includes("checking") || source.includes("Checking")),
    "error.tsx must have checking state"
  );

  // Must have stillOffline state
  assert(
    source.includes("stillOffline"),
    "error.tsx must have stillOffline state"
  );

  // Must have timeout ref for safety timeout
  assert(
    source.includes("useRef") && source.includes("timeout"),
    "error.tsx must have timeout ref"
  );

  // Must call determineRetryAction when offline
  assert(
    source.includes("determineRetryAction("),
    "error.tsx must call determineRetryAction"
  );

  // Must show "Checking…" text
  assert(
    source.includes("Checking") || source.includes("checking"),
    "error.tsx must show 'Checking' state"
  );

  // Must show "Still offline" text
  assert(
    source.includes("Still offline"),
    "error.tsx must show 'Still offline' message"
  );

  // Must have minHeight for no layout shift
  assert(
    source.includes("minHeight") || source.includes("min-height"),
    "error.tsx must reserve space for feedback (minHeight)"
  );

  // Must have visibility toggle or always render (not conditional mount with &&)
  assert(
    source.includes("visibility") || source.includes("stillOffline ?"),
    "error.tsx must use visibility toggle"
  );

  // Must NOT conditionally mount the feedback element with {stillOffline && (...)}
  // which causes layout shift when it appears
  const conditionalMountPattern = /\{stillOffline\s*&&\s*\(/;
  assert(
    !conditionalMountPattern.test(source),
    "error.tsx must NOT conditionally mount feedback with {stillOffline && ()} - causes layout shift"
  );

  // Must always render the feedback element to reserve space
  const feedbackElementCount = (source.match(/<p[^>]*role="status"/g) || []).length;
  assert(
    feedbackElementCount >= 1,
    "error.tsx must have at least one status element (feedback)"
  );

  // Must have role="status" and aria-live for accessibility
  assert(
    source.includes('role="status"') && source.includes('aria-live="polite"'),
    'error.tsx feedback must have role="status" and aria-live="polite"'
  );

  // Must disable button during checking
  assert(
    source.includes("disabled={checking}") || source.includes("disabled={checking"),
    "error.tsx button must be disabled during checking"
  );

  // Must clear timeout on success (before router.refresh)
  const refreshIndex = source.indexOf("router.refresh");
  const clearTimeoutBeforeRefresh = source.lastIndexOf("clearTimeout", refreshIndex);
  assert(
    clearTimeoutBeforeRefresh !== -1 && clearTimeoutBeforeRefresh < refreshIndex,
    "error.tsx must clear timeout before router.refresh (prevents 'Still offline' on slow 3G)"
  );

  console.log("  ✓ Imports determineRetryAction from offline-retry-logic");
  console.log("  ✓ Has checking and stillOffline states");
  console.log("  ✓ Has timeout ref for safety");
  console.log("  ✓ Calls determineRetryAction when offline");
  console.log("  ✓ Shows 'Checking…' state");
  console.log("  ✓ Shows 'Still offline' message");
  console.log("  ✓ Reserves space for feedback (no layout shift)");
  console.log("  ✓ Always renders feedback element (not conditional mount)");
  console.log("  ✓ Uses visibility toggle");
  console.log('  ✓ Has role="status" and aria-live="polite"');
  console.log("  ✓ Disables button during checking");
  console.log("  ✓ Clears timeout before router.refresh");
}

console.log("Testing Error Boundary Retry Behavior");
console.log("====================================");

testErrorBoundaryRetryBehavior();

console.log("\n✅ All error boundary retry tests passed\n");
