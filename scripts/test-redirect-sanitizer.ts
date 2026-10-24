/**
 * Test: Auth callback redirect sanitizer
 *
 * Validates that sanitizeRedirectPath prevents open redirects through:
 * 1. Protocol-relative URLs (//evil.example)
 * 2. @ symbols that parse as user@host
 * 3. Schemes (http:, https:, javascript:, data:)
 * 4. Backslashes (Windows path separators)
 * 5. Encoded variants of the above
 * 6. Domain suffixes (.evil.example)
 *
 * Run: npx tsx scripts/test-redirect-sanitizer.ts
 */

import { sanitizeRedirectPath } from "../src/lib/auth/redirect";

const ORIGIN = "https://abhyas-indol.vercel.app";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

console.log("\n1. Valid same-origin paths (should be allowed)");
{
  check(
    "allows /today",
    sanitizeRedirectPath("/today", ORIGIN) === "/today",
  );
  check(
    "allows /settings",
    sanitizeRedirectPath("/settings", ORIGIN) === "/settings",
  );
  check(
    "allows /breathe/box",
    sanitizeRedirectPath("/breathe/box", ORIGIN) === "/breathe/box",
  );
  check(
    "allows /session/abc?x=1",
    sanitizeRedirectPath("/session/abc?x=1", ORIGIN) === "/session/abc?x=1",
  );
  check("allows / (root)", sanitizeRedirectPath("/", ORIGIN) === "/");
  check(
    "allows /path#hash",
    sanitizeRedirectPath("/path#hash", ORIGIN) === "/path#hash",
  );
  check(
    "allows /path-with-dashes",
    sanitizeRedirectPath("/path-with-dashes", ORIGIN) ===
      "/path-with-dashes",
  );
}

console.log("\n2. Null and empty (should default to /today)");
{
  check("null → /today", sanitizeRedirectPath(null, ORIGIN) === "/today");
  check("empty string → /today", sanitizeRedirectPath("", ORIGIN) === "/today");
}

console.log("\n3. Protocol-relative URLs (should be rejected)");
{
  check(
    "rejects //evil.example",
    sanitizeRedirectPath("//evil.example", ORIGIN) === "/today",
  );
  check(
    "rejects //evil.example/path",
    sanitizeRedirectPath("//evil.example/path", ORIGIN) === "/today",
  );
  check(
    "rejects ///evil.example",
    sanitizeRedirectPath("///evil.example", ORIGIN) === "/today",
  );
}

console.log("\n4. @ symbol (parses as user@host in URL)");
{
  check(
    "rejects @evil.example",
    sanitizeRedirectPath("@evil.example", ORIGIN) === "/today",
  );
  const atPath = sanitizeRedirectPath("/@evil.example", ORIGIN);
  check(
    "rejects /@evil.example",
    atPath === "/today",
    `got: ${atPath}`,
  );
  const atMiddle = sanitizeRedirectPath("/path@evil.example", ORIGIN);
  check(
    "rejects /path@evil.example",
    atMiddle === "/today",
    `got: ${atMiddle}`,
  );
}

console.log("\n5. Explicit schemes");
{
  check(
    "rejects http://evil.example",
    sanitizeRedirectPath("http://evil.example", ORIGIN) === "/today",
  );
  check(
    "rejects https://evil.example",
    sanitizeRedirectPath("https://evil.example", ORIGIN) === "/today",
  );
  const jsScheme = sanitizeRedirectPath("javascript:alert(1)", ORIGIN);
  check(
    "rejects javascript:alert(1)",
    jsScheme === "/today",
    `got: ${jsScheme}`,
  );
  check(
    "rejects data:text/html",
    sanitizeRedirectPath("data:text/html,<script>", ORIGIN) === "/today",
  );
}

console.log("\n6. Backslashes (Windows path separators)");
{
  check(
    "rejects /\\evil",
    sanitizeRedirectPath("/\\evil", ORIGIN) === "/today",
  );
  check(
    "rejects \\\\evil.example",
    sanitizeRedirectPath("\\\\evil.example", ORIGIN) === "/today",
  );
  check(
    "rejects /path\\evil",
    sanitizeRedirectPath("/path\\evil", ORIGIN) === "/today",
  );
}

console.log("\n7. URL-encoded bypasses (should be rejected)");
{
  // %2F is /
  check(
    "rejects %2F%2Fevil.example (encoded //)",
    sanitizeRedirectPath("%2F%2Fevil.example", ORIGIN) === "/today",
  );
  check(
    "rejects /%2Fevil.example",
    sanitizeRedirectPath("/%2Fevil.example", ORIGIN) === "/today",
  );

  // %2f is / (lowercase)
  check(
    "rejects %2f%2fevil.example",
    sanitizeRedirectPath("%2f%2fevil.example", ORIGIN) === "/today",
  );

  // %5C is \
  check(
    "rejects %5C%5Cevil.example (encoded \\\\)",
    sanitizeRedirectPath("%5C%5Cevil.example", ORIGIN) === "/today",
  );
  check(
    "rejects /%5Cevil",
    sanitizeRedirectPath("/%5Cevil", ORIGIN) === "/today",
  );

  // Mixed case
  check(
    "rejects %2F%2fevil",
    sanitizeRedirectPath("%2F%2fevil", ORIGIN) === "/today",
  );
}

console.log("\n8. Domain suffix attacks");
{
  const dotEvil = sanitizeRedirectPath("/.evil.example", ORIGIN);
  check(
    "rejects /.evil.example",
    dotEvil === "/today",
    `got: ${dotEvil}`,
  );
  const dotInMiddle = sanitizeRedirectPath("/path.evil.example/more", ORIGIN);
  check(
    "allows /path.evil.example/more (safe filename)",
    dotInMiddle === "/path.evil.example/more",
    `got: ${dotInMiddle}`,
  );
}

console.log("\n9. Paths not starting with /");
{
  check(
    "rejects evil.example",
    sanitizeRedirectPath("evil.example", ORIGIN) === "/today",
  );
  check(
    "rejects ./relative",
    sanitizeRedirectPath("./relative", ORIGIN) === "/today",
  );
  check(
    "rejects ../parent",
    sanitizeRedirectPath("../parent", ORIGIN) === "/today",
  );
}

console.log("\n10. Malformed encoding");
{
  check(
    "rejects malformed %GG",
    sanitizeRedirectPath("/%GG", ORIGIN) === "/today",
  );
  check(
    "rejects incomplete %2",
    sanitizeRedirectPath("/%2", ORIGIN) === "/today",
  );
}

console.log(
  `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`,
);
process.exit(failures === 0 ? 0 : 1);
