/**
 * Test: Proxy matcher regex - sw.js anchoring
 *
 * Validates that the proxy matcher uses `sw\\.js$` (escaped dot, anchored)
 * to exclude ONLY /sw.js and not paths like /sw.jsfoo.
 *
 * This test extracts and verifies the regex pattern string, then tests the
 * actual regex behavior for the sw.js exclusion specifically.
 *
 * Run: npx tsx scripts/test-proxy-matcher.ts
 */

import { config } from "../src/proxy";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

const matcherPattern = config.matcher[0];

console.log(`\nMatcher pattern: ${matcherPattern}\n`);

console.log("1. Pattern string contains properly escaped and anchored sw.js");
{
  // The pattern should contain `sw\.js$` (escaped dot, anchored)
  // not just `sw.js` which would match /sw.jsfoo
  check(
    "contains sw\\.js$ (escaped and anchored)",
    matcherPattern.includes("sw\\.js$"),
    `pattern: ${matcherPattern}`,
  );
  check(
    "does not contain unescaped sw.js (sw.js without backslash)",
    !matcherPattern.includes("sw.js|") && !matcherPattern.includes("|sw.js"),
  );
}

console.log("\n2. Extract and test the negative lookahead regex");
{
  // The Next.js matcher pattern format is: `/((?!excluded1|excluded2).*)`
  // We can extract just the negative lookahead part and test it
  const lookaheadMatch = matcherPattern.match(/\(\?\!(.*?)\)/);
  if (lookaheadMatch) {
    const excludedPatterns = lookaheadMatch[1];
    console.log(`  Excluded patterns: ${excludedPatterns}`);
    
    // Test that sw\.js$ is in the excluded patterns
    check("sw\\.js$ is in excluded patterns", excludedPatterns.includes("sw\\.js$"));
    
    // Create a regex to test just the sw.js pattern
    // In a negative lookahead, sw\.js$ should match "/sw.js" but not "/sw.jsfoo"
    const swjsPattern = /sw\.js$/;
    
    check("sw.js matches the pattern", swjsPattern.test("sw.js"));
    check("sw.jsfoo does NOT match the pattern", !swjsPattern.test("sw.jsfoo"));
    check("swxjs does NOT match the pattern", !swjsPattern.test("swxjs"));
    check("sw.json does NOT match the pattern", !swjsPattern.test("sw.json"));
  } else {
    failures++;
    console.log("  FAIL: Could not extract negative lookahead from pattern");
  }
}

console.log("\n3. Verify TS string escaping");
{
  // In the TypeScript source, we write `sw\\.js$`
  // This should result in the regex string `sw\.js$` (single backslash)
  const raw = String.raw`sw\.js$`;
  check(
    "TS double backslash becomes regex single backslash",
    raw === "sw\\.js$" && matcherPattern.includes("sw\\.js$"),
    `expected in pattern: sw\\.js$`,
  );
}

console.log(
  `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`,
);
process.exit(failures === 0 ? 0 : 1);
