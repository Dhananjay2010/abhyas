#!/usr/bin/env tsx
/**
 * Test runnerErrorMessage 5xx detection and kind parameter
 */

import { runnerErrorMessage } from "../src/lib/session/runner-error-message";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failed++;
    console.error(`  ❌ ${message}`);
    process.exitCode = 1;
  } else {
    passed++;
    console.log(`  ✓ ${message}`);
  }
}

console.log("\n=== 5xx Detection Tests ===\n");

// Test 1: "Weight 500 kg is above the max" should NOT be 5xx
const weight500 = new Error("Weight 500 kg is above the max");
const weight500Result = runnerErrorMessage(weight500);
assert(
  !weight500Result.includes("Something went wrong on our side"),
  "Weight 500 kg should NOT be classified as 5xx"
);
assert(
  weight500Result === "Weight 500 kg is above the max",
  "Weight 500 kg returns raw message"
);

// Test 2: "Set 1500 rejected" should NOT be 5xx
const set1500 = new Error("Set 1500 rejected");
const set1500Result = runnerErrorMessage(set1500);
assert(
  !set1500Result.includes("Something went wrong on our side"),
  "Set 1500 should NOT be classified as 5xx"
);
assert(
  set1500Result === "Set 1500 rejected",
  "Set 1500 returns raw message"
);

// Test 3: "status 503" SHOULD be 5xx
const status503 = new Error("status 503");
const status503Result = runnerErrorMessage(status503);
assert(
  status503Result.includes("Something went wrong on our side"),
  "status 503 SHOULD be classified as 5xx"
);

// Test 4: "Internal Server Error" SHOULD be 5xx
const internalError = new Error("Internal Server Error");
const internalResult = runnerErrorMessage(internalError);
assert(
  internalResult.includes("Something went wrong on our side"),
  "Internal Server Error SHOULD be classified as 5xx"
);

// Test 5: "Status 500 Service Unavailable" SHOULD be 5xx (case insensitive)
const status500Upper = new Error("Status 500 Service Unavailable");
const status500UpperResult = runnerErrorMessage(status500Upper);
assert(
  status500UpperResult.includes("Something went wrong on our side"),
  "Status 500 (uppercase) SHOULD be classified as 5xx"
);

// Test 6: "Request failed with status 599" SHOULD be 5xx
const status599 = new Error("Request failed with status 599");
const status599Result = runnerErrorMessage(status599);
assert(
  status599Result.includes("Something went wrong on our side"),
  "status 599 SHOULD be classified as 5xx"
);

console.log("\n=== Kind Parameter Tests ===\n");

// Test 7: Offline with kind='set'
const offlineError = new TypeError("Failed to fetch");
const offlineSetResult = runnerErrorMessage(offlineError, 'set');
assert(
  offlineSetResult === "You're offline. That set wasn't saved yet, tap Log set again when you're back online.",
  "Offline error with kind='set' shows set-specific copy"
);

// Test 8: Offline with kind='action'
const offlineActionResult = runnerErrorMessage(offlineError, 'action');
assert(
  offlineActionResult === "You're offline. That didn't go through, try again when you're back online.",
  "Offline error with kind='action' shows generic copy"
);

// Test 9: 5xx with kind='set'
const server5xxError = new Error("status 500");
const server5xxSetResult = runnerErrorMessage(server5xxError, 'set');
assert(
  server5xxSetResult === "Something went wrong on our side. That set wasn't saved, please try again.",
  "5xx error with kind='set' shows set-specific copy"
);

// Test 10: 5xx with kind='action'
const server5xxActionResult = runnerErrorMessage(server5xxError, 'action');
assert(
  server5xxActionResult === "Something went wrong on our side. Please try again.",
  "5xx error with kind='action' shows generic copy"
);

console.log(`\n✅ ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
