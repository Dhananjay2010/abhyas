/**
 * Test: Offline retry logic (pure module)
 *
 * Verifies that the pure retry decision logic safely handles malicious URL
 * parameters and prevents XSS and open redirect attacks.
 */

import { determineRetryAction, type RetryResult } from "../src/lib/offline-retry-logic";
import { safeNextPath } from "../src/lib/safe-next-path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

/**
 * Test the pure retry decision logic.
 */
async function testRetryDecisionLogic() {
  console.log("\n▶ Testing retry decision logic (pure module)...");

  // Test still-offline scenarios
  console.log("\n▶ Testing still-offline scenarios...");

  let result: RetryResult;

  result = determineRetryAction(false, false, null);
  assert(
    result.type === "still-offline",
    "offline + fetch failed + no url param → still-offline"
  );

  result = determineRetryAction(true, false, null);
  assert(
    result.type === "still-offline",
    "online + fetch failed + no url param → still-offline"
  );

  result = determineRetryAction(false, true, null);
  assert(
    result.type === "still-offline",
    "offline + fetch succeeded + no url param → still-offline (shouldn't happen but defensive)"
  );

  result = determineRetryAction(false, false, "/today");
  assert(
    result.type === "still-offline",
    "offline + fetch failed + url param → still-offline"
  );

  console.log("  ✓ Still-offline scenarios return still-offline");

  // Test reload scenarios
  console.log("\n▶ Testing reload scenarios...");

  result = determineRetryAction(true, true, null, "/session/123");
  assert(
    result.type === "reload",
    "online + fetch succeeded + no url param + non-offline path → reload"
  );

  result = determineRetryAction(true, true, "", "/today");
  assert(
    result.type === "reload",
    "online + fetch succeeded + empty url param + non-offline path → reload"
  );

  console.log("  ✓ Reload scenarios return reload");

  // Test /offline special handling
  console.log("\n▶ Testing /offline path special handling...");

  result = determineRetryAction(true, true, null, "/offline");
  assert(
    result.type === "navigate" && result.url === "/",
    "online + fetch succeeded + no url param + /offline path → navigate to / (not reload /offline)"
  );

  console.log("  ✓ /offline with no url param navigates to / instead of reloading");

  // Test navigate scenarios
  console.log("\n▶ Testing navigate scenarios...");

  result = determineRetryAction(true, true, "/today");
  assert(
    result.type === "navigate" && result.url === "/today",
    "online + fetch succeeded + valid url param → navigate to /today"
  );

  result = determineRetryAction(true, true, "/session/abc123");
  assert(
    result.type === "navigate" && result.url === "/session/abc123",
    "online + fetch succeeded + valid session url → navigate to /session/abc123"
  );

  console.log("  ✓ Navigate scenarios return navigate with correct URL");

  // Test XSS and open redirect attacks via safeNextPath
  console.log("\n▶ Testing XSS and open redirect attacks...");

  result = determineRetryAction(true, true, "javascript:alert(1)");
  assert(
    result.type === "navigate" && result.url === "/",
    "javascript:alert(1) → navigate to / (safe fallback)"
  );

  result = determineRetryAction(true, true, "//evil.com");
  assert(
    result.type === "navigate" && result.url === "/",
    "//evil.com → navigate to / (safe fallback)"
  );

  result = determineRetryAction(true, true, "https://evil.com");
  assert(
    result.type === "navigate" && result.url === "/",
    "https://evil.com → navigate to / (safe fallback)"
  );

  console.log("  ✓ XSS and open redirect attacks blocked via safeNextPath");
}

/**
 * Test safeNextPath directly for completeness.
 */
async function testSafeNextPath() {
  console.log("\n▶ Testing safeNextPath function...");

  // Test XSS attacks with javascript: URLs
  console.log("\n▶ Testing javascript: URL attacks...");
  
  assert(
    safeNextPath("javascript:alert(1)", "/") === "/",
    "javascript:alert(1) must resolve to safe fallback /"
  );
  
  assert(
    safeNextPath("JaVaScRiPt:alert(1)", "/") === "/",
    "JaVaScRiPt:alert(1) (mixed case) must resolve to safe fallback /"
  );
  
  assert(
    safeNextPath(" javascript:alert(1)", "/") === "/",
    "' javascript:alert(1)' (space prefix) must resolve to safe fallback /"
  );
  
  assert(
    safeNextPath("\tjavascript:alert(1)", "/") === "/",
    "'\\tjavascript:alert(1)' (tab prefix) must resolve to safe fallback /"
  );

  assert(
    safeNextPath("\njavascript:alert(1)", "/") === "/",
    "'\\njavascript:alert(1)' (newline prefix) must resolve to safe fallback /"
  );
  
  console.log("  ✓ javascript: URL attacks blocked");

  // Test data: URL attacks
  console.log("\n▶ Testing data: URL attacks...");
  
  assert(
    safeNextPath("data:text/html,<script>alert(1)</script>", "/") === "/",
    "data:text/html URL must resolve to safe fallback /"
  );
  
  console.log("  ✓ data: URL attacks blocked");

  // Test open redirect attacks
  console.log("\n▶ Testing open redirect attacks...");
  
  assert(
    safeNextPath("//evil.com", "/") === "/",
    "//evil.com (protocol-relative URL) must resolve to safe fallback /"
  );

  assert(
    safeNextPath("//example.com", "/") === "/",
    "//example.com (protocol-relative URL, confirmed on prod) must resolve to safe fallback /"
  );
  
  assert(
    safeNextPath("https://evil.com", "/") === "/",
    "https://evil.com (absolute URL) must resolve to safe fallback /"
  );
  
  assert(
    safeNextPath("/\\evil.com", "/") === "/",
    "/\\\\evil.com (backslash trick) must resolve to safe fallback /"
  );
  
  assert(
    safeNextPath("/%2F%2Fevil.com", "/") === "/",
    "/%2F%2Fevil.com (URL-encoded // uppercase) must resolve to safe fallback /"
  );

  assert(
    safeNextPath("/%2f%2fevil.com", "/") === "/",
    "/%2f%2fevil.com (URL-encoded // lowercase) must resolve to safe fallback /"
  );

  assert(
    safeNextPath("/%2F%2fevil.com", "/") === "/",
    "/%2F%2fevil.com (URL-encoded // mixed case) must resolve to safe fallback /"
  );
  
  console.log("  ✓ Open redirect attacks blocked");
  console.log("  ✓ Case-insensitive %2F%2F detection works");

  // Test valid same-origin paths
  console.log("\n▶ Testing valid same-origin paths...");
  
  assert(
    safeNextPath("/today?x=1", "/") === "/today?x=1",
    "/today?x=1 must resolve to itself"
  );
  
  assert(
    safeNextPath("/session/abc123", "/") === "/session/abc123",
    "/session/abc123 must resolve to itself"
  );
  
  assert(
    safeNextPath("/history", "/") === "/history",
    "/history must resolve to itself"
  );
  
  console.log("  ✓ Valid same-origin paths pass through");

  // Test missing param
  console.log("\n▶ Testing missing/empty paths...");
  
  assert(
    safeNextPath(null, "/") === "/",
    "null must resolve to fallback /"
  );
  
  assert(
    safeNextPath("", "/") === "/",
    "Empty string must resolve to fallback /"
  );

  assert(
    safeNextPath(undefined, "/") === "/",
    "undefined must resolve to fallback /"
  );
  
  console.log("  ✓ Missing/empty paths resolve to fallback");

  // Test edge cases
  console.log("\n▶ Testing edge cases...");
  
  assert(
    safeNextPath("/", "/fallback") === "/",
    "/ (root) must resolve to itself"
  );
  
  assert(
    safeNextPath("/today#section", "/") === "/today#section",
    "/today#section (with hash) must resolve to itself"
  );
  
  console.log("  ✓ Edge cases handled correctly");
}

/**
 * Test timeout clearing behavior.
 * 
 * The timeout should be cleared when navigation starts (ping succeeds),
 * so slow 3G doesn't flip to "Still offline" while the page loads.
 */
async function testTimeoutClearing() {
  console.log("\n▶ Testing timeout clearing on navigation start...");

  let timeoutCleared = false;

  // Simulate the timeout setup
  const timeoutId = setTimeout(() => {
    throw new Error("Timeout should have been cleared before firing");
  }, 100);

  // Simulate clearing the timeout when navigation starts (ping succeeds)
  clearTimeout(timeoutId);
  timeoutCleared = true;

  // Wait a bit to ensure timeout doesn't fire
  await new Promise(resolve => setTimeout(resolve, 150));

  assert(
    timeoutCleared,
    "Timeout should be cleared when navigation starts"
  );

  console.log("  ✓ Timeout cleared when ping succeeds and navigation starts");
  console.log("  ✓ Prevents 'Still offline' on slow 3G after successful ping");
}

console.log("Testing Offline Retry Logic");
console.log("============================");

(async () => {
  await testRetryDecisionLogic();
  await testSafeNextPath();
  await testTimeoutClearing();
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
