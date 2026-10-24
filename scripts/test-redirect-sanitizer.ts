/**
 * L1 tests: Auth callback redirect sanitizer
 *
 * Validates that sanitizeRedirectPath prevents open redirects through:
 * 1. Protocol-relative URLs (//evil.example)
 * 2. @ symbols that parse as user@host
 * 3. Schemes (http:, https:, javascript:, data:)
 * 4. Backslashes (Windows path separators)
 * 5. Encoded variants of the above
 * 6. Paths not starting with /
 *
 *   npx tsx scripts/test-redirect-sanitizer.ts
 */

/**
 * Copy of the sanitizeRedirectPath function from auth/callback/route.ts
 * Kept in sync manually for testing.
 */
function sanitizeRedirectPath(next: string | null): string {
  if (!next || typeof next !== "string") return "/today";
  
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return "/today";
  }
  
  if (!decoded.startsWith("/")) return "/today";
  if (decoded.startsWith("//")) return "/today";
  if (decoded.includes("//")) return "/today";
  if (decoded.includes("\\")) return "/today";
  if (decoded.includes("@")) return "/today";
  if (decoded.includes(":")) return "/today";
  if (/[\x00-\x1f]/.test(decoded)) return "/today";
  if (next.includes("%2F") || next.includes("%2f")) return "/today";
  if (next.includes("%5C") || next.includes("%5c")) return "/today";
  
  return decoded;
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Valid same-origin paths (should be allowed)");
{
  check("allows /today", sanitizeRedirectPath("/today") === "/today");
  check("allows /settings", sanitizeRedirectPath("/settings") === "/settings");
  check("allows /breathe/box-breathing", sanitizeRedirectPath("/breathe/box-breathing") === "/breathe/box-breathing");
  check("allows /session/abc-123", sanitizeRedirectPath("/session/abc-123") === "/session/abc-123");
  check("allows / (root)", sanitizeRedirectPath("/") === "/");
  check("allows /path?query=value", sanitizeRedirectPath("/path?query=value") === "/path?query=value");
  check("allows /path#hash", sanitizeRedirectPath("/path#hash") === "/path#hash");
  check("allows /path-with-dashes", sanitizeRedirectPath("/path-with-dashes") === "/path-with-dashes");
  check("allows /path_with_underscores", sanitizeRedirectPath("/path_with_underscores") === "/path_with_underscores");
}

console.log("\n2. Null and empty (should default to /today)");
{
  check("null → /today", sanitizeRedirectPath(null) === "/today");
  check("empty string → /today", sanitizeRedirectPath("") === "/today");
  check("whitespace → /today", sanitizeRedirectPath("   ") === "/today");
}

console.log("\n3. Protocol-relative URLs (should be rejected)");
{
  check("rejects //evil.example", sanitizeRedirectPath("//evil.example") === "/today");
  check("rejects //evil.example/path", sanitizeRedirectPath("//evil.example/path") === "/today");
  check("rejects ///evil.example", sanitizeRedirectPath("///evil.example") === "/today");
}

console.log("\n4. @ symbol (parses as user@host)");
{
  check("rejects /@evil.example", sanitizeRedirectPath("/@evil.example") === "/today");
  check("rejects /path@evil.example", sanitizeRedirectPath("/path@evil.example") === "/today");
  check("rejects /valid/path@evil.example/more", sanitizeRedirectPath("/valid/path@evil.example/more") === "/today");
}

console.log("\n5. Explicit schemes");
{
  check("rejects http://evil.example", sanitizeRedirectPath("http://evil.example") === "/today");
  check("rejects https://evil.example", sanitizeRedirectPath("https://evil.example") === "/today");
  check("rejects javascript:alert(1)", sanitizeRedirectPath("javascript:alert(1)") === "/today");
  check("rejects data:text/html,<script>alert(1)</script>", sanitizeRedirectPath("data:text/html,<script>alert(1)</script>") === "/today");
  check("rejects /path/with:colon", sanitizeRedirectPath("/path/with:colon") === "/today");
}

console.log("\n6. Backslashes (Windows path separators)");
{
  check("rejects \\\\evil.example", sanitizeRedirectPath("\\\\evil.example") === "/today");
  check("rejects /path\\evil", sanitizeRedirectPath("/path\\evil") === "/today");
  check("rejects \\path", sanitizeRedirectPath("\\path") === "/today");
}

console.log("\n7. URL-encoded bypasses (should be rejected)");
{
  // %2F is /
  check("rejects %2F%2Fevil.example (encoded //)", sanitizeRedirectPath("%2F%2Fevil.example") === "/today");
  check("rejects /%2Fevil.example (encoded /)", sanitizeRedirectPath("/%2Fevil.example") === "/today");
  
  // %2f is / (lowercase)
  check("rejects %2f%2fevil.example (lowercase)", sanitizeRedirectPath("%2f%2fevil.example") === "/today");
  
  // %5C is \
  check("rejects %5C%5Cevil.example (encoded \\\\)", sanitizeRedirectPath("%5C%5Cevil.example") === "/today");
  check("rejects /%5Cevil (encoded backslash)", sanitizeRedirectPath("/%5Cevil") === "/today");
  
  // %40 is @
  const atEncoded = sanitizeRedirectPath("/%40evil.example");
  check("rejects /%40evil.example (encoded @)", atEncoded === "/today", atEncoded);
  
  // %3A is :
  const colonEncoded = sanitizeRedirectPath("/path%3Awith%3Acolons");
  check("rejects /path%3Awith%3Acolons (encoded :)", colonEncoded === "/today", colonEncoded);
  
  // Mixed case encoding
  check("rejects %2F%2fevil (mixed case)", sanitizeRedirectPath("%2F%2fevil") === "/today");
}

console.log("\n8. Paths not starting with /");
{
  check("rejects evil.example", sanitizeRedirectPath("evil.example") === "/today");
  check("rejects https://evil.example", sanitizeRedirectPath("https://evil.example") === "/today");
  check("rejects ./relative", sanitizeRedirectPath("./relative") === "/today");
  check("rejects ../parent", sanitizeRedirectPath("../parent") === "/today");
}

console.log("\n9. Malformed encoding");
{
  check("rejects malformed %", sanitizeRedirectPath("/%GG") === "/today");
  check("rejects incomplete %2", sanitizeRedirectPath("/%2") === "/today");
}

console.log("\n10. Real-world attack patterns");
{
  // Patterns seen in open redirect exploits
  check("rejects /\\evil.example", sanitizeRedirectPath("/\\evil.example") === "/today");
  
  // Control characters could enable bypasses
  check("rejects /%09//evil.example (tab + //)", sanitizeRedirectPath("/%09//evil.example") === "/today");
  check("rejects /%00/evil.example (null byte)", sanitizeRedirectPath("/%00/evil.example") === "/today");
  check("rejects /%0a/path (newline)", sanitizeRedirectPath("/%0a/path") === "/today");
  
  // Protocol-relative with path
  check("rejects //evil.example/path?looks=safe", sanitizeRedirectPath("//evil.example/path?looks=safe") === "/today");
  
  // Schemes with encoded characters
  check("rejects htt%70://evil (encoded p)", sanitizeRedirectPath("htt%70://evil") === "/today");
  
  // Multiple bypass attempts
  check("rejects //evil@attacker.com", sanitizeRedirectPath("//evil@attacker.com") === "/today");
  
  // // anywhere in the path
  check("rejects /path//with//double", sanitizeRedirectPath("/path//with//double") === "/today");
}

console.log("\n11. Edge cases that should be allowed (safe)");
{
  // These look suspicious but are actually safe same-origin paths
  check("allows /evil.example (filename)", sanitizeRedirectPath("/evil.example") === "/evil.example");
  check("allows /path.html", sanitizeRedirectPath("/path.html") === "/path.html");
  check("allows /path/to/file.txt", sanitizeRedirectPath("/path/to/file.txt") === "/path/to/file.txt");
  
  // Query strings with suspicious-looking content
  check("allows /path?url=/other", sanitizeRedirectPath("/path?url=/other") === "/path?url=/other");
  check("allows /path?next=/more", sanitizeRedirectPath("/path?next=/more") === "/path?next=/more");
}

console.log("\n12. Demonstrate the vulnerability this fixes");
{
  // Without the fix, these would redirect to external sites
  console.log("  Without sanitization, these would be open redirects:");
  console.log("    //evil.example → redirects to https://evil.example");
  console.log("    /@evil.example → new URL parses host as evil.example");
  console.log("    %2F%2Fevil → decodes to //evil, then redirects");
  console.log("  With sanitization, they all return /today");
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
