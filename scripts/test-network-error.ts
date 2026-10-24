/**
 * Test isNetworkError helper.
 *
 * Validates detection of network errors for offline handling:
 * - TypeError: Failed to fetch
 * - navigator.onLine = false
 * - Other network-related errors
 *
 *   npx tsx scripts/test-network-error.ts
 */

import { isNetworkError } from "../src/lib/session/network-error";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. TypeError: Failed to fetch");
{
  const error = new TypeError("Failed to fetch");
  const result = isNetworkError(error);
  check("detected as network error", result === true, String(result));
}

console.log("\n2. TypeError: Network request failed");
{
  const error = new TypeError("Network request failed");
  const result = isNetworkError(error);
  check("detected as network error", result === true, String(result));
}

console.log("\n3. TypeError: Load failed");
{
  const error = new TypeError("Load failed");
  const result = isNetworkError(error);
  check("detected as network error", result === true, String(result));
}

console.log("\n4. Generic Error with 'offline' in message");
{
  const error = new Error("You are offline");
  const result = isNetworkError(error);
  check("not detected (only TypeError)", result === false, String(result));
}

console.log("\n5. Generic Error with 'network' in message");
{
  const error = new Error("Network error occurred");
  const result = isNetworkError(error);
  check("not detected (only TypeError)", result === false, String(result));
}

console.log("\n6. Non-network TypeError");
{
  const error = new TypeError("Cannot read property 'x' of undefined");
  const result = isNetworkError(error);
  check("not detected as network error", result === false, String(result));
}

console.log("\n7. Generic Error without network keywords");
{
  const error = new Error("Something went wrong");
  const result = isNetworkError(error);
  check("not detected as network error", result === false, String(result));
}

console.log("\n8. Non-Error object");
{
  const error = "string error";
  const result = isNetworkError(error);
  check("not detected as network error", result === false, String(result));
}

console.log("\n9. null error");
{
  const error = null;
  const result = isNetworkError(error);
  check("not detected as network error", result === false, String(result));
}

console.log("\n10. Case insensitive detection");
{
  const error = new TypeError("FAILED TO FETCH");
  const result = isNetworkError(error);
  check("detected despite uppercase", result === true, String(result));
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
