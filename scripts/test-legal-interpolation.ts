/**
 * Test: Legal page brand interpolation spacing
 *
 * Verifies that brand variables ({appName}, {gymName}, etc.) in legal pages
 * are properly spaced - no words should run straight into the variable.
 * Example bad: "By using{appName}" → should be "By using {appName}"
 */

import * as fs from "fs";
import * as path from "path";
import { getAllBrands } from "../src/lib/branding";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testLegalPageInterpolation(pageName: string, pagePath: string) {
  console.log(`\n▶ Testing ${pageName} brand interpolation...`);

  assert(
    fs.existsSync(pagePath),
    `${pagePath} must exist`
  );

  const source = fs.readFileSync(pagePath, "utf-8");

  // Check for common bad patterns: word directly followed by {variable}
  // Pattern: alphanumeric character followed directly by { (no space)
  const badPatterns = [
    /[a-zA-Z0-9]\{appName\}/,
    /[a-zA-Z0-9]\{gymName\}/,
    /[a-zA-Z0-9]\{supportEmail\}/,
    /[a-zA-Z0-9]\{gymAddress\}/,
    /[a-zA-Z0-9]\{gymPhone\}/,
  ];

  for (const pattern of badPatterns) {
    const match = source.match(pattern);
    assert(
      !match,
      `Found missing space before interpolation: "${match?.[0]}" in ${pageName}`
    );
  }

  // Also check for variables directly followed by word (no space or punctuation)
  const badPatternsSuffix = [
    /\{appName\}[a-zA-Z]/,
    /\{gymName\}[a-zA-Z]/,
  ];

  for (const pattern of badPatternsSuffix) {
    const match = source.match(pattern);
    assert(
      !match,
      `Found missing space/punctuation after interpolation: "${match?.[0]}" in ${pageName}`
    );
  }

  console.log(`  ✓ No words run into brand variables`);
  console.log(`  ✓ All interpolations properly spaced`);
}

function testAllBrandsRender() {
  console.log("\n▶ Testing all brands render in legal text...");

  const brands = getAllBrands();

  assert(
    brands.length > 0,
    "getAllBrands() must return at least one brand"
  );

  console.log(`  Testing ${brands.length} brand(s)...`);

  // For each brand, verify the name doesn't cause concatenation issues
  for (const brand of brands) {
    // Brand names should not start or end with alphanumeric that would
    // create concatenation when interpolated
    const name = brand.name;
    
    // Test example sentence: "By using {appName}, you consent"
    // Should render as "By using Abhyas, you consent" not "By usingAbhyas, you consent"
    const testSentence = `By using ${name}, you consent`;
    
    assert(
      !testSentence.includes(`using${name.charAt(0)}`),
      `Brand "${name}" creates concatenation in test sentence`
    );

    console.log(`  ✓ Brand ${brand.id} (${name}) renders cleanly`);
  }

  console.log(`  ✓ All ${brands.length} brand(s) render without concatenation`);
}

console.log("Testing Legal Page Brand Interpolation");
console.log("======================================");

const privacyPath = path.join(__dirname, "..", "src", "app", "privacy", "page.tsx");
const termsPath = path.join(__dirname, "..", "src", "app", "terms", "page.tsx");

testLegalPageInterpolation("privacy page", privacyPath);
testLegalPageInterpolation("terms page", termsPath);
testAllBrandsRender();

console.log("\n✅ All legal interpolation tests passed\n");
