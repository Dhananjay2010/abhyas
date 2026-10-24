#!/usr/bin/env tsx
/**
 * Behavioral test: redirect-origin.ts malformed x-forwarded-host handling
 *
 * Requirements:
 * - getRedirectOrigin must handle malformed x-forwarded-host without crashing
 * - Must fall back to requestOrigin on malformed header
 * - Must wrap new URL() in try/catch
 *
 * This test fails on the old code (pre-fix).
 */

import { readFileSync } from "fs";
import { join } from "path";
import { strict as assert } from "assert";

console.log("▶ Testing redirect-origin.ts malformed header handling...\n");

const redirectOriginPath = join(process.cwd(), "src/lib/auth/redirect-origin.ts");
const redirectOriginSource = readFileSync(redirectOriginPath, "utf-8");

console.log("▶ Verifying try/catch around URL parsing...");

assert(
  redirectOriginSource.includes("try") && redirectOriginSource.includes("catch"),
  "getRedirectOrigin must use try/catch to handle malformed x-forwarded-host"
);

assert(
  redirectOriginSource.includes("new URL") &&
  redirectOriginSource.includes("forwardedHost") &&
  redirectOriginSource.includes("catch"),
  "try/catch must wrap new URL() for forwardedHost parsing"
);

assert(
  redirectOriginSource.match(/catch[^{]*{[^}]*return\s+requestOrigin/s) !== null,
  "catch block must fall back to requestOrigin"
);

console.log("  ✓ Uses try/catch around URL parsing");
console.log("  ✓ Wraps new URL() for forwardedHost");
console.log("  ✓ Falls back to requestOrigin on error");

console.log("\n▶ Testing with malformed header...");

// Import the function dynamically
const { getRedirectOrigin } = await import("../src/lib/auth/redirect-origin.js");

// Create a request with malformed x-forwarded-host
const request = new Request("http://localhost:3000/api/auth/callback", {
  headers: {
    "x-forwarded-host": "not a valid host:9999:extra:garbage",
    "x-forwarded-proto": "https",
  },
});

let result: string;
let crashed = false;

try {
  result = getRedirectOrigin(request);
} catch (error) {
  crashed = true;
  console.error("  ✗ Function crashed with malformed header:", error);
}

assert(!crashed, "getRedirectOrigin must not crash on malformed x-forwarded-host");

assert(
  result === "http://localhost:3000",
  `getRedirectOrigin must fall back to requestOrigin, got ${result}`
);

console.log("  ✓ Does not crash on malformed x-forwarded-host");
console.log("  ✓ Falls back to requestOrigin (http://localhost:3000)");

console.log("\n✅ All redirect-origin malformed header tests passed");
