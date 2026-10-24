/**
 * Test: Error boundary retry behavior
 *
 * Verifies that error.tsx uses OfflineScreen for offline errors,
 * which includes retry functionality with proper feedback.
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

  // Must use OfflineScreen component for offline errors
  assert(
    source.includes("OfflineScreen"),
    "error.tsx must use OfflineScreen component for offline errors"
  );

  // Must import OfflineScreen from components
  assert(
    source.includes('@/components/offline-screen') || 
    source.includes("@/components/offline-screen"),
    "error.tsx must import OfflineScreen from @/components/offline-screen"
  );

  // OfflineScreen handles all the retry logic, so error.tsx just delegates
  // Verify OfflineScreen component has the retry behavior
  const offlineScreenPath = path.join(__dirname, "..", "src", "components", "offline-screen.tsx");
  const offlineScreenSource = fs.readFileSync(offlineScreenPath, "utf-8");

  assert(
    offlineScreenSource.includes("OfflineRetry"),
    "OfflineScreen must use OfflineRetry component"
  );

  // Check that OfflineRetry has the retry logic
  const offlineRetryPath = path.join(__dirname, "..", "src", "app", "offline", "offline-retry.tsx");
  const offlineRetrySource = fs.readFileSync(offlineRetryPath, "utf-8");

  assert(
    offlineRetrySource.includes("Still offline"),
    "OfflineRetry must show 'Still offline' message"
  );

  assert(
    offlineRetrySource.includes("Checking"),
    "OfflineRetry must show 'Checking' state"
  );

  assert(
    offlineRetrySource.includes("minHeight") || offlineRetrySource.includes("min-height"),
    "OfflineRetry must reserve space for feedback (minHeight)"
  );

  console.log("  ✓ error.tsx uses OfflineScreen for offline errors");
  console.log("  ✓ error.tsx imports OfflineScreen from @/components/offline-screen");
  console.log("  ✓ OfflineScreen uses OfflineRetry component");
  console.log("  ✓ OfflineRetry shows 'Still offline' message");
  console.log("  ✓ OfflineRetry shows 'Checking' state");
  console.log("  ✓ OfflineRetry reserves space for feedback (minHeight)");
}

console.log("Testing Error Boundary Retry Behavior");
console.log("====================================");

testErrorBoundaryRetryBehavior();

console.log("\n✅ All error boundary retry tests passed\n");
