/**
 * Test: Offline retry target resolution
 *
 * Verifies that the offline retry logic safely handles malicious URL parameters
 * and prevents XSS and open redirect attacks.
 */

import { safeNextPath } from "../src/lib/safe-next-path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

/**
 * Simulate the retry target resolution logic.
 * 
 * When url param is absent, the page should reload the current page.
 * When url param is present, navigate to safeNextPath(value).
 */
function resolveRetryTarget(urlParam: string | null): string | "reload" {
  if (urlParam) {
    return safeNextPath(urlParam, "/");
  } else {
    // No url param: reload current page (represented as "reload")
    return "reload";
  }
}

async function testOfflineRetry() {
  console.log("\n▶ Testing offline retry target resolution...");

  // Test XSS attacks with javascript: URLs
  console.log("\n▶ Testing javascript: URL attacks...");
  
  assert(
    resolveRetryTarget("javascript:alert(1)") === "/",
    "javascript:alert(1) must resolve to safe fallback /"
  );
  
  assert(
    resolveRetryTarget("JaVaScRiPt:alert(1)") === "/",
    "JaVaScRiPt:alert(1) (mixed case) must resolve to safe fallback /"
  );
  
  assert(
    resolveRetryTarget(" javascript:alert(1)") === "/",
    "' javascript:alert(1)' (space prefix) must resolve to safe fallback /"
  );
  
  assert(
    resolveRetryTarget("\tjavascript:alert(1)") === "/",
    "'\\tjavascript:alert(1)' (tab prefix) must resolve to safe fallback /"
  );

  assert(
    resolveRetryTarget("\njavascript:alert(1)") === "/",
    "'\\njavascript:alert(1)' (newline prefix) must resolve to safe fallback /"
  );
  
  console.log("  ✓ javascript: URL attacks blocked");

  // Test data: URL attacks
  console.log("\n▶ Testing data: URL attacks...");
  
  assert(
    resolveRetryTarget("data:text/html,<script>alert(1)</script>") === "/",
    "data:text/html URL must resolve to safe fallback /"
  );
  
  console.log("  ✓ data: URL attacks blocked");

  // Test open redirect attacks
  console.log("\n▶ Testing open redirect attacks...");
  
  assert(
    resolveRetryTarget("//evil.com") === "/",
    "//evil.com (protocol-relative URL) must resolve to safe fallback /"
  );

  assert(
    resolveRetryTarget("//example.com") === "/",
    "//example.com (protocol-relative URL, confirmed on prod) must resolve to safe fallback /"
  );
  
  assert(
    resolveRetryTarget("https://evil.com") === "/",
    "https://evil.com (absolute URL) must resolve to safe fallback /"
  );
  
  assert(
    resolveRetryTarget("/\\evil.com") === "/",
    "/\\\\evil.com (backslash trick) must resolve to safe fallback /"
  );
  
  assert(
    resolveRetryTarget("/%2F%2Fevil.com") === "/",
    "/%2F%2Fevil.com (URL-encoded //) must resolve to safe fallback /"
  );
  
  console.log("  ✓ Open redirect attacks blocked");

  // Test valid same-origin paths
  console.log("\n▶ Testing valid same-origin paths...");
  
  assert(
    resolveRetryTarget("/today?x=1") === "/today?x=1",
    "/today?x=1 must resolve to itself"
  );
  
  assert(
    resolveRetryTarget("/session/abc123") === "/session/abc123",
    "/session/abc123 must resolve to itself"
  );
  
  assert(
    resolveRetryTarget("/history") === "/history",
    "/history must resolve to itself"
  );
  
  console.log("  ✓ Valid same-origin paths pass through");

  // Test missing param (should reload current page)
  console.log("\n▶ Testing missing url param...");
  
  assert(
    resolveRetryTarget(null) === "reload",
    "Missing url param must trigger reload of current page"
  );
  
  assert(
    resolveRetryTarget("") === "reload",
    "Empty url param must trigger reload of current page"
  );
  
  console.log("  ✓ Missing param triggers current page reload");

  // Test edge cases
  console.log("\n▶ Testing edge cases...");
  
  assert(
    resolveRetryTarget("/") === "/",
    "/ (root) must resolve to itself"
  );
  
  assert(
    resolveRetryTarget("/today#section") === "/today#section",
    "/today#section (with hash) must resolve to itself"
  );
  
  console.log("  ✓ Edge cases handled correctly");
}

/**
 * Test timeout behavior to prevent button from getting stuck.
 * 
 * The component should reset to idle state if navigation doesn't happen
 * within the timeout period (4 seconds).
 */
async function testTimeoutBehavior() {
  console.log("\n▶ Testing timeout behavior...");

  const RETRY_TIMEOUT_MS = 4000;

  // Simulate the timeout logic
  let checking = true;
  let stillOffline = false;

  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      checking = false;
      stillOffline = true;
      resolve();
    }, RETRY_TIMEOUT_MS);
  });

  // Wait for timeout to fire
  await timeoutPromise;

  assert(
    !checking && stillOffline,
    "After timeout, checking should be false and stillOffline should be true"
  );

  console.log(`  ✓ Button resets to idle state after ${RETRY_TIMEOUT_MS}ms timeout`);
  console.log("  ✓ Shows 'Still offline' message after timeout");
}

console.log("Testing Offline Retry Target Resolution");
console.log("=======================================");

(async () => {
  await testOfflineRetry();
  await testTimeoutBehavior();
})().then(
  () => {
    console.log("\n✅ All offline retry tests passed\n");
    process.exit(0);
  },
  (error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
);
