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
    "rejects /\\ at start",
    sanitizeRedirectPath("/\\", ORIGIN) === "/today",
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

console.log("\n7. Control characters and whitespace");
{
  // Raw control characters
  check(
    "rejects /path with space",
    sanitizeRedirectPath("/path with space", ORIGIN) === "/today",
  );
  check(
    "rejects /path\twith\ttab",
    sanitizeRedirectPath("/path\twith\ttab", ORIGIN) === "/today",
  );
  check(
    "rejects /path\nwith\nnewline",
    sanitizeRedirectPath("/path\nwith\nnewline", ORIGIN) === "/today",
  );
  check(
    "rejects /path\rwith\rCR",
    sanitizeRedirectPath("/path\rwith\rCR", ORIGIN) === "/today",
  );
  check(
    "rejects /path\x00null",
    sanitizeRedirectPath("/path\x00null", ORIGIN) === "/today",
  );
  check(
    "rejects /path\x7Fdel",
    sanitizeRedirectPath("/path\x7Fdel", ORIGIN) === "/today",
  );

  // Encoded control characters
  check(
    "rejects %09 (tab)",
    sanitizeRedirectPath("/%09evil", ORIGIN) === "/today",
  );
  check(
    "rejects %0a (LF)",
    sanitizeRedirectPath("/%0aevil", ORIGIN) === "/today",
  );
  check(
    "rejects %0A (LF uppercase)",
    sanitizeRedirectPath("/%0Aevil", ORIGIN) === "/today",
  );
  check(
    "rejects %0d (CR)",
    sanitizeRedirectPath("/%0devil", ORIGIN) === "/today",
  );
  check(
    "rejects %0D (CR uppercase)",
    sanitizeRedirectPath("/%0Devil", ORIGIN) === "/today",
  );
  check(
    "rejects %00 (null byte)",
    sanitizeRedirectPath("/%00evil", ORIGIN) === "/today",
  );
  check(
    "rejects %7f (DEL)",
    sanitizeRedirectPath("/%7fevil", ORIGIN) === "/today",
  );
  check(
    "rejects %7F (DEL uppercase)",
    sanitizeRedirectPath("/%7Fevil", ORIGIN) === "/today",
  );
  check(
    "rejects %20 (space)",
    sanitizeRedirectPath("/%20evil", ORIGIN) === "/today",
  );
  check(
    "rejects + (space in query encoding)",
    sanitizeRedirectPath("/path+with+plus", ORIGIN) === "/today",
  );
  check(
    "rejects %0c (form feed)",
    sanitizeRedirectPath("/%0cevil", ORIGIN) === "/today",
  );
  check(
    "rejects %1f (unit separator)",
    sanitizeRedirectPath("/%1fevil", ORIGIN) === "/today",
  );
}

console.log("\n8. Explicit schemes");
{
  check(
    "rejects javascript: scheme",
    sanitizeRedirectPath("javascript:alert(1)", ORIGIN) === "/today",
  );
  check(
    "rejects data: scheme",
    sanitizeRedirectPath("data:text/html,<script>", ORIGIN) === "/today",
  );
  check(
    "rejects http: scheme",
    sanitizeRedirectPath("http://evil.example", ORIGIN) === "/today",
  );
  check(
    "rejects https: scheme",
    sanitizeRedirectPath("https://evil.example", ORIGIN) === "/today",
  );
  check(
    "rejects file: scheme",
    sanitizeRedirectPath("file:///etc/passwd", ORIGIN) === "/today",
  );
  check(
    "rejects ftp: scheme",
    sanitizeRedirectPath("ftp://evil.example", ORIGIN) === "/today",
  );
  check(
    "rejects vbscript: scheme",
    sanitizeRedirectPath("vbscript:msgbox(1)", ORIGIN) === "/today",
  );
  check(
    "rejects about: scheme",
    sanitizeRedirectPath("about:blank", ORIGIN) === "/today",
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

console.log("\n11. Origin validation via new URL()");
{
  // These should be caught by the new URL() origin check
  // even if they pass earlier filters
  check(
    "rejects when URL resolves to different origin",
    sanitizeRedirectPath("/@attacker.com", ORIGIN) === "/today",
  );
  
  // Valid same-origin paths should pass
  const validPath = sanitizeRedirectPath("/session/abc?x=1#hash", ORIGIN);
  check(
    "allows valid same-origin path with query and hash",
    validPath === "/session/abc?x=1#hash",
    `got: ${validPath}`,
  );
}

console.log("\n12. Legitimate query strings (should be allowed)");
{
  // + in query (common in search params)
  const plusQuery = sanitizeRedirectPath("/search?q=hello+world", ORIGIN);
  check(
    "allows + in query string",
    plusQuery === "/search?q=hello+world",
    `got: ${plusQuery}`,
  );
  
  // %20 (space) in query
  const spaceQuery = sanitizeRedirectPath("/search?q=hello%20world", ORIGIN);
  check(
    "allows %20 in query string",
    spaceQuery === "/search?q=hello%20world",
    `got: ${spaceQuery}`,
  );
  
  // Encoded slash in query value (like dates)
  const dateQuery = sanitizeRedirectPath("/cal?date=2026%2F10%2F24", ORIGIN);
  check(
    "allows encoded slash (%2F) in query value",
    dateQuery === "/cal?date=2026%2F10%2F24",
    `got: ${dateQuery}`,
  );
  
  // Multiple query params with encoding
  const multiQuery = sanitizeRedirectPath("/page?name=John+Doe&date=2026%2F10", ORIGIN);
  check(
    "allows multiple query params with + and %2F",
    multiQuery === "/page?name=John+Doe&date=2026%2F10",
    `got: ${multiQuery}`,
  );
  
  // URL-encoded special chars in query (but not control chars)
  const encodedQuery = sanitizeRedirectPath("/api?key=abc%3Ddef%26ghi", ORIGIN);
  check(
    "allows encoded = (%3D) and & (%26) in query",
    encodedQuery === "/api?key=abc%3Ddef%26ghi",
    `got: ${encodedQuery}`,
  );
}

console.log("\n13. Malicious query strings (should be rejected)");
{
  // // in query
  const slashQuery = sanitizeRedirectPath("/page?redir=//evil.example", ORIGIN);
  check(
    "rejects // in query value",
    slashQuery === "/today",
    `got: ${slashQuery}`,
  );
  
  // @ in query
  const atQuery = sanitizeRedirectPath("/page?user=admin@evil.example", ORIGIN);
  check(
    "rejects @ in query value",
    atQuery === "/today",
    `got: ${atQuery}`,
  );
  
  // Backslash in query
  const backslashQuery = sanitizeRedirectPath("/page?path=C:\\Windows", ORIGIN);
  check(
    "rejects \\ in query value",
    backslashQuery === "/today",
    `got: ${backslashQuery}`,
  );
  
  // Control character (tab) in query
  const tabQuery = sanitizeRedirectPath("/page?val=%09evil", ORIGIN);
  check(
    "rejects encoded tab (%09) in query",
    tabQuery === "/today",
    `got: ${tabQuery}`,
  );
  
  // Control character (newline) in query
  const nlQuery = sanitizeRedirectPath("/page?val=%0Aevil", ORIGIN);
  check(
    "rejects encoded newline (%0A) in query",
    nlQuery === "/today",
    `got: ${nlQuery}`,
  );
}

console.log("\n14. Path restrictions (still apply)");
{
  // + and %20 in path (not query) should still be rejected
  const plusPath = sanitizeRedirectPath("/hello+world", ORIGIN);
  check(
    "rejects + in path",
    plusPath === "/today",
    `got: ${plusPath}`,
  );
  
  const spacePath = sanitizeRedirectPath("/hello%20world", ORIGIN);
  check(
    "rejects %20 in path",
    spacePath === "/today",
    `got: ${spacePath}`,
  );
  
  // Encoded slash in path (not query) should still be rejected
  const slashPath = sanitizeRedirectPath("/path%2Fwith%2Fslash", ORIGIN);
  check(
    "rejects %2F in path",
    slashPath === "/today",
    `got: ${slashPath}`,
  );
}

console.log(
  `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`,
);
process.exit(failures === 0 ? 0 : 1);
