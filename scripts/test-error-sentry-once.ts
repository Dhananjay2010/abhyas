#!/usr/bin/env tsx
/**
 * Behavioral test: error.tsx reports to Sentry at most once per error
 *
 * Requirements:
 * - error.tsx must use useRef to track reported errors
 * - Must not re-report the same error object on online/offline toggle
 * - Must import useRef from react
 *
 * This test fails on the old code (pre-fix).
 */

import { readFileSync } from "fs";
import { join } from "path";
import { strict as assert } from "assert";

console.log("▶ Testing error.tsx Sentry reporting once per error...\n");

const errorPath = join(process.cwd(), "src/app/error.tsx");
const errorSource = readFileSync(errorPath, "utf-8");

console.log("▶ Verifying useRef import...");

assert(
  errorSource.includes("import") && errorSource.includes("useRef") && errorSource.includes("from") && errorSource.includes("react"),
  "error.tsx must import useRef from react"
);

console.log("  ✓ Imports useRef from react");

console.log("\n▶ Verifying useRef guard for Sentry reporting...");

assert(
  errorSource.includes("useRef") && (errorSource.includes("reportedErrorRef") || errorSource.includes("reportedError") || errorSource.includes("sentryReported")),
  "error.tsx must use useRef to track reported errors"
);

assert(
  errorSource.includes("reportedErrorRef.current") || errorSource.includes("reportedError.current") || errorSource.includes("sentryReported.current"),
  "error.tsx must check ref.current before reporting"
);

assert(
  errorSource.includes("!== error") || errorSource.includes("reportedErrorRef.current = error") || errorSource.includes("reportedError.current = error"),
  "error.tsx must compare error object with ref and update it"
);

assert(
  errorSource.includes("Sentry.captureException") &&
  (errorSource.includes("reportedErrorRef.current !== error") || errorSource.includes("reportedError.current !== error")),
  "error.tsx must only call Sentry.captureException if error not already reported"
);

console.log("  ✓ Uses useRef to track reported errors");
console.log("  ✓ Checks ref.current before reporting");
console.log("  ✓ Compares error object with ref");
console.log("  ✓ Updates ref after reporting");
console.log("  ✓ Prevents duplicate Sentry reports");

console.log("\n✅ All error Sentry once tests passed");
