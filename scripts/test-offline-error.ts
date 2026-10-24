/**
 * Test: Offline error detection
 *
 * Verifies that isOfflineError correctly identifies offline/network errors
 * and doesn't false-positive on regular errors.
 */

import { isOfflineError } from "../src/lib/offline-error";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testOfflineDetection() {
  console.log("\n▶ Testing offline error detection...");

  // navigator.onLine === false: always offline
  const regularError = new Error("Something broke");
  assert(
    isOfflineError(regularError, false),
    "Should detect offline when navigator.onLine is false (any error)"
  );

  // Fetch API offline: TypeError with "Failed to fetch"
  const fetchError = new TypeError("Failed to fetch");
  assert(
    isOfflineError(fetchError, true),
    "Should detect TypeError: Failed to fetch (fetch offline)"
  );

  const fetchErrorUpperCase = new TypeError("FAILED TO FETCH");
  assert(
    isOfflineError(fetchErrorUpperCase, true),
    "Should detect 'FAILED TO FETCH' (case insensitive)"
  );

  // Next.js chunk load errors
  const chunkError = new Error("Loading chunk 42 failed");
  chunkError.name = "ChunkLoadError";
  assert(
    isOfflineError(chunkError, true),
    "Should detect ChunkLoadError (Next.js dynamic import failed)"
  );

  const chunkErrorAlt = new Error("Loading chunk failed");
  chunkErrorAlt.name = "ChunkError";
  assert(
    isOfflineError(chunkErrorAlt, true),
    "Should detect ChunkError (alternate name)"
  );

  const chunkLoadMessage = new Error("Error loading chunk 5");
  assert(
    isOfflineError(chunkLoadMessage, true),
    "Should detect 'loading chunk' in message (any error name)"
  );

  // Generic network errors
  const networkError = new Error("Request failed");
  networkError.name = "NetworkError";
  assert(
    isOfflineError(networkError, true),
    "Should detect NetworkError (generic network failure)"
  );

  const networkMessageError = new Error("Network error occurred");
  assert(
    isOfflineError(networkMessageError, true),
    "Should detect 'network error' in message"
  );

  // Load failed errors
  const loadFailed = new Error("Load failed");
  assert(
    isOfflineError(loadFailed, true),
    "Should detect 'load failed' in message"
  );

  const failedToLoad = new Error("Failed to load resource");
  assert(
    isOfflineError(failedToLoad, true),
    "Should detect 'failed to load' in message"
  );

  console.log("  ✓ Detects navigator.onLine === false");
  console.log("  ✓ Detects TypeError: Failed to fetch");
  console.log("  ✓ Detects ChunkLoadError / ChunkError");
  console.log("  ✓ Detects 'loading chunk' in message");
  console.log("  ✓ Detects NetworkError");
  console.log("  ✓ Detects 'network error' in message");
  console.log("  ✓ Detects 'load failed' / 'failed to load'");
}

function testNonOfflineErrors() {
  console.log("\n▶ Testing non-offline errors...");

  // Regular errors: NOT offline
  const normalError = new Error("Something went wrong");
  assert(
    !isOfflineError(normalError, true),
    "Should NOT detect regular Error as offline"
  );

  const typeError = new TypeError("Cannot read property 'x' of undefined");
  assert(
    !isOfflineError(typeError, true),
    "Should NOT detect non-fetch TypeError as offline"
  );

  const referenceError = new ReferenceError("foo is not defined");
  assert(
    !isOfflineError(referenceError, true),
    "Should NOT detect ReferenceError as offline"
  );

  // Non-Error values
  assert(
    !isOfflineError("string error", true),
    "Should NOT detect thrown string as offline"
  );

  assert(
    !isOfflineError(null, true),
    "Should NOT detect null as offline"
  );

  assert(
    !isOfflineError(undefined, true),
    "Should NOT detect undefined as offline"
  );

  assert(
    !isOfflineError({ message: "Failed to fetch" }, true),
    "Should NOT detect plain object as offline (not Error instance)"
  );

  console.log("  ✓ Does NOT detect regular errors as offline");
  console.log("  ✓ Does NOT detect non-fetch TypeError as offline");
  console.log("  ✓ Does NOT detect ReferenceError as offline");
  console.log("  ✓ Does NOT detect thrown non-Error values as offline");
}

console.log("Testing Offline Error Detection");
console.log("===============================");

testOfflineDetection();
testNonOfflineErrors();

console.log("\n✅ All offline error detection tests passed\n");
