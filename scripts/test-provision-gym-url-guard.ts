/**
 * Pure unit test for provision-gym URL guard.
 * 
 * Verifies that the URL guard correctly identifies localhost/127.0.0.1/::1
 * and rejects other hostnames.
 * 
 * This test does NOT require a real database connection or network calls.
 * 
 * Run: npm run test:provision-gym-url-guard
 */

import { isLocalhostUrl } from "./lib-provision-gym-url-guard";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function runTests() {
  console.log("=== Test 1: localhost URLs are allowed ===");
  {
    check("http://localhost:54321 is localhost", isLocalhostUrl("http://localhost:54321") === true);
    check("https://localhost is localhost", isLocalhostUrl("https://localhost") === true);
    check("http://localhost is localhost", isLocalhostUrl("http://localhost") === true);
  }
  console.log("");

  console.log("=== Test 2: 127.0.0.1 URLs are allowed ===");
  {
    check("http://127.0.0.1:54321 is localhost", isLocalhostUrl("http://127.0.0.1:54321") === true);
    check("https://127.0.0.1 is localhost", isLocalhostUrl("https://127.0.0.1") === true);
  }
  console.log("");

  console.log("=== Test 3: ::1 (IPv6 localhost) URLs are allowed ===");
  {
    check("http://[::1]:54321 is localhost", isLocalhostUrl("http://[::1]:54321") === true);
    check("https://[::1] is localhost", isLocalhostUrl("https://[::1]") === true);
  }
  console.log("");

  console.log("=== Test 4: Remote URLs are rejected ===");
  {
    check("https://abcdefg.supabase.co is NOT localhost", isLocalhostUrl("https://abcdefg.supabase.co") === false);
    check("https://xyz.supabase.co is NOT localhost", isLocalhostUrl("https://xyz.supabase.co") === false);
    check("https://example.com is NOT localhost", isLocalhostUrl("https://example.com") === false);
  }
  console.log("");

  console.log("=== Test 5: Localhost-like hostnames are rejected ===");
  {
    check("https://localhost.evil.com is NOT localhost", isLocalhostUrl("https://localhost.evil.com") === false);
    check("https://mylocalhost.com is NOT localhost", isLocalhostUrl("https://mylocalhost.com") === false);
  }
  console.log("");

  console.log("=== Test 6: Query params don't affect hostname check ===");
  {
    check("https://evil.com/?x=127.0.0.1 is NOT localhost", isLocalhostUrl("https://evil.com/?x=127.0.0.1") === false);
    check("https://example.com/?host=localhost is NOT localhost", isLocalhostUrl("https://example.com/?host=localhost") === false);
  }
  console.log("");

  console.log("=== Test 7: Invalid URLs are rejected ===");
  {
    check("invalid-url is NOT localhost", isLocalhostUrl("invalid-url") === false);
    check("empty string is NOT localhost", isLocalhostUrl("") === false);
  }
  console.log("");

  return failures === 0;
}

const success = runTests();

if (success) {
  console.log("✅ All URL guard tests passed\n");
  process.exit(0);
} else {
  console.log(`\n❌ ${failures} test(s) failed\n`);
  process.exit(1);
}
