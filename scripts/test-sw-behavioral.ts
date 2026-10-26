/**
 * SW Session Route Behavioral Test (PR #151)
 * 
 * Tests the extracted isSessionRoute matcher logic.
 */

import { isSessionRoute, type SessionRouteRequest } from "../src/lib/sw-session-matcher";

const ORIGIN = "https://example.com";

function mockRequest(
  url: string,
  method: string = "GET",
  mode: string = "navigate",
  rscHeader: string | null = null
): SessionRouteRequest {
  return {
    method,
    url,
    mode,
    headers: {
      get: (name: string) => (name === "RSC" ? rscHeader : null),
    },
  };
}

function check(desc: string, ok: boolean) {
  if (ok) {
    console.log(`  ✓ ${desc}`);
  } else {
    console.error(`  ✗ ${desc}`);
    process.exit(1);
  }
}

console.log("SW Session Route Behavioral Test");
console.log("─".repeat(60));

// Test 1: /session/[id] routes match
const sessionUrls = [
  "https://example.com/session/abc123",
  "https://example.com/session/def456-ghi789",
  "https://example.com/session/12345",
];

console.log("Testing /session/[id] pattern matching...");
for (const url of sessionUrls) {
  const result = isSessionRoute(mockRequest(url), { origin: ORIGIN });
  check(`Matches ${url}`, result);
}

// Test 2: Non-session routes don't match
const nonSessionUrls = [
  "https://example.com/",
  "https://example.com/today",
  "https://example.com/sessions",
  "https://example.com/api/session/abc",
  "https://example.com/session",
  "https://example.com/session/",
];

console.log("");
console.log("Testing non-session routes...");
for (const url of nonSessionUrls) {
  const result = isSessionRoute(mockRequest(url), { origin: ORIGIN });
  check(`Rejects ${url}`, !result);
}

// Test 3: RSC requests excluded
console.log("");
console.log("Testing RSC exclusions...");
check(
  "Rejects RSC header request",
  !isSessionRoute(mockRequest("https://example.com/session/abc", "GET", "navigate", "1"), { origin: ORIGIN })
);
check(
  "Rejects _rsc query param",
  !isSessionRoute(mockRequest("https://example.com/session/abc?_rsc=123"), { origin: ORIGIN })
);

// Test 4: Wrong method excluded
console.log("");
console.log("Testing method restrictions...");
check(
  "Rejects POST",
  !isSessionRoute(mockRequest("https://example.com/session/abc", "POST"), { origin: ORIGIN })
);

// Test 5: Wrong mode excluded
console.log("");
console.log("Testing mode restrictions...");
check(
  "Rejects non-navigate mode",
  !isSessionRoute(mockRequest("https://example.com/session/abc", "GET", "cors"), { origin: ORIGIN })
);

// Test 6: Different origin excluded
console.log("");
console.log("Testing origin restrictions...");
check(
  "Rejects different origin",
  !isSessionRoute(mockRequest("https://other.com/session/abc"), { origin: ORIGIN })
);

console.log("");
console.log("─".repeat(60));
console.log("PASSED: SW session route matcher works correctly");
