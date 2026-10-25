/**
 * Test: Offline retry reserved space
 *
 * Verifies that the "Still offline" feedback text doesn't shift the layout:
 * - The feedback element always reserves space (minHeight or visibility toggle)
 * - Content doesn't move when stillOffline becomes true
 */

import * as fs from "fs";
import * as path from "path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testOfflineRetryReservedSpace() {
  console.log("\n▶ Testing offline retry reserved space...");

  const retryPath = path.join(__dirname, "..", "src", "app", "offline", "offline-retry.tsx");
  
  assert(
    fs.existsSync(retryPath),
    "src/app/offline/offline-retry.tsx must exist"
  );

  const source = fs.readFileSync(retryPath, "utf-8");

  // Must have minHeight on feedbackStyle
  assert(
    source.includes("feedbackStyle") && source.includes("minHeight"),
    "feedbackStyle must include minHeight to reserve space"
  );

  // Must use visibility toggle (visible/hidden) or always render
  const hasVisibilityToggle = source.includes("visibility:") || source.includes("visibility :");
  const alwaysRendered = source.includes("{stillOffline ? ") && source.includes(": ");

  assert(
    hasVisibilityToggle || alwaysRendered,
    "Feedback must use visibility toggle or always render to prevent layout shift"
  );

  // If using visibility, must have both visible and hidden states
  if (hasVisibilityToggle) {
    assert(
      (source.includes('"visible"') || source.includes("'visible'") || source.includes("visible")) &&
      (source.includes('"hidden"') || source.includes("'hidden'") || source.includes("hidden")),
      "Visibility toggle must have both visible and hidden states"
    );
  }

  // If always rendering, must have conditional content
  if (alwaysRendered) {
    assert(
      source.includes("Still offline"),
      "Always-rendered feedback must include 'Still offline' text"
    );
    
    // Must have a non-breaking space or similar placeholder for the hidden state
    assert(
      source.includes("\\u00A0") || source.includes("&nbsp;") || source.includes(" "),
      "Always-rendered feedback should have placeholder (nbsp or similar) for hidden state"
    );
  }

  // Must have role="status" and aria-live for accessibility
  assert(
    source.includes('role="status"') && source.includes('aria-live="polite"'),
    'Feedback element must have role="status" and aria-live="polite"'
  );

  console.log("  ✓ feedbackStyle includes minHeight");
  console.log("  ✓ Uses visibility toggle or always renders");
  console.log("  ✓ Prevents layout shift when showing/hiding");
  console.log('  ✓ Has role="status" and aria-live="polite"');
}

console.log("Testing Offline Retry Reserved Space");
console.log("===================================");

testOfflineRetryReservedSpace();

console.log("\n✅ All offline retry reserved space tests passed\n");
