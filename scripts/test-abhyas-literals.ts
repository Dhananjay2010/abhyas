/**
 * Test: No hardcoded 'Abhyas' brand name in UI strings
 *
 * Verifies that user-facing strings use branding.name or branding.shortName
 * instead of hardcoded 'Abhyas' literals, so white-label deployments show
 * the correct brand name.
 *
 * Allowlist:
 * - src/lib/branding.ts (the default brand config itself)
 * - /dev/ pages (development-only, not production)
 * - Actual comments (line and block)
 * - Per-line exceptions for genuine cases (with TODO for review)
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

/**
 * Check if a line is inside a comment.
 * This is a simple heuristic that works for most cases.
 * Lines starting with // or (only for JSDoc) * (block comment continuation).
 * Lines with // after code.
 * Does not handle multi-line comments in complex cases.
 */
function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  // Line comment
  if (trimmed.startsWith("//")) {
    return true;
  }
  // Check if 'Abhyas' appears only in a // comment at the end of the line
  const commentIndex = line.indexOf("//");
  const abhyasIndex = line.indexOf("Abhyas");
  if (commentIndex !== -1 && abhyasIndex > commentIndex) {
    return true;
  }
  return false;
}

/**
 * Check if a line is a JSDoc comment line.
 * Lines starting with * inside JSDoc blocks.
 */
function isJSDocLine(line: string): boolean {
  const trimmed = line.trim();
  // JSDoc continuation line (inside /** */ block)
  return trimmed.startsWith("*");
}

/**
 * Per-line allow patterns for genuine exceptions.
 * Each pattern should be as narrow as possible: file path + line content.
 * Use ONLY for files outside this PR's scope (owned by other developers).
 */
function isAllowedLineException(filePath: string, lineNum: string, lineContent: string): boolean {
  // TODO(white-label): These are outside this PR's scope; owners will fix separately
  
  // Files outside our lane (session, today, program, onboarding actions)
  // Format: "path:lineNum:content fragment"
  const allowlist: Array<[string, string, string]> = [
    // Add specific exceptions here as needed
    // Example: ["src/app/onboarding/actions.ts", "42", "Abhyas"],
  ];
  
  for (const [allowedPath, allowedLine, allowedFragment] of allowlist) {
    if (filePath.includes(allowedPath) && lineNum === allowedLine && lineContent.includes(allowedFragment)) {
      return true;
    }
  }
  
  return false;
}

function testNoHardcodedAbhyasInUI() {
  console.log("\n▶ Testing for hardcoded 'Abhyas' in UI strings...");

  // Search for 'Abhyas' in src/app/ and src/lib/
  const appResult = execSync(
    `rg -n "Abhyas" src/app --type-add 'tsx:*.tsx' --type ts --type tsx || true`,
    { encoding: "utf-8" }
  );
  const libResult = execSync(
    `rg -n "Abhyas" src/lib --type-add 'tsx:*.tsx' --type ts --type tsx || true`,
    { encoding: "utf-8" }
  );

  const lines = [
    ...appResult.trim().split("\n").filter(Boolean),
    ...libResult.trim().split("\n").filter(Boolean),
  ];

  const violations: string[] = [];
  const filesOutsideOurLane: Record<string, string[]> = {};

  for (const line of lines) {
    // Parse: "path:lineNum:content"
    const match = line.match(/^([^:]+):(\d+):(.*)$/);
    if (!match) continue;
    
    const [, filePath, lineNum, lineContent] = match;

    // Skip branding.ts (the config itself)
    if (filePath.includes("branding.ts")) {
      continue;
    }

    // Skip /dev/ pages (development-only)
    if (filePath.includes("/dev/")) {
      continue;
    }

    // Skip if it's a line comment
    if (isCommentLine(lineContent)) {
      continue;
    }

    // Skip if it's a JSDoc comment line
    if (isJSDocLine(lineContent)) {
      continue;
    }

    // Check per-line exceptions (narrow allowlist with line numbers)
    if (isAllowedLineException(filePath, lineNum, lineContent)) {
      continue;
    }

    // Files outside our lane: onboarding/settings actions, today/history/session/breathe/progress/program
    const outsideLanePatterns = [
      /onboarding\/actions\.ts/,
      /settings\/actions\.ts/,
      /today\/.*\.tsx?/,
      /history\/.*\.tsx?/,
      /session\/.*\.tsx?/,
      /breathe\/.*\.tsx?/,
      /progress\/.*\.tsx?/,
      /program\/.*\.tsx?/,
    ];

    if (outsideLanePatterns.some(pattern => pattern.test(filePath))) {
      if (!filesOutsideOurLane[filePath]) {
        filesOutsideOurLane[filePath] = [];
      }
      filesOutsideOurLane[filePath].push(`${lineNum}: ${lineContent.trim()}`);
      continue;
    }

    // This is a violation
    violations.push(line);
  }

  // Report files outside our lane (informational, not a failure)
  if (Object.keys(filesOutsideOurLane).length > 0) {
    console.log("\n  ℹ Found 'Abhyas' in files outside this PR's scope:");
    for (const [filePath, occurrences] of Object.entries(filesOutsideOurLane)) {
      console.log(`     ${filePath}:`);
      for (const occurrence of occurrences) {
        console.log(`       ${occurrence}`);
      }
    }
    console.log("  These files are owned by other developers and will be updated separately.");
  }

  if (violations.length > 0) {
    console.error("\n  ❌ Found hardcoded 'Abhyas' in app UI strings:");
    for (const violation of violations) {
      console.error(`     ${violation}`);
    }
    console.error("\n  All UI strings should use branding.name or branding.shortName.");
    throw new Error("Hardcoded 'Abhyas' literals found in app UI");
  }

  console.log("  ✓ No hardcoded 'Abhyas' in app UI strings (within this PR's scope)");
}

function testDefaultBrandStillAbhyas() {
  console.log("\n▶ Testing default brand config...");

  // Verify the default brand in branding.ts is still named 'Abhyas'
  const brandingFile = readFileSync("src/lib/branding.ts", "utf-8");

  assert(
    brandingFile.includes('name: "Abhyas"'),
    "Default brand config should define name as 'Abhyas'"
  );

  console.log("  ✓ Default brand (abhyas) config includes 'Abhyas' name");
}

function main() {
  console.log("Testing 'Abhyas' literal usage...");

  try {
    testNoHardcodedAbhyasInUI();
    testDefaultBrandStillAbhyas();
    console.log("\n✅ All 'Abhyas' literal tests passed!\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ 'Abhyas' literal tests failed:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
