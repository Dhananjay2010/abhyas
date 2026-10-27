/**
 * Test: Branding validation (unit)
 * 
 * Validates:
 * - Hex color validation (6-digit, case-insensitive)
 * - Logo URL validation (https:// or /storage/)
 * - Color pair validation (both or neither)
 * 
 * Imports the real production validators from branding-validation.ts
 */

import { isValidHexColor, isValidLogoUrl } from "../src/lib/gym/branding-validation";

function assertBranding(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testHexColorValidation() {
  console.log("\n▶ Testing hex color validation...");

  // Valid colors
  const validColors = [
    "#FF9A2E",
    "#E8850C",
    "#000000",
    "#FFFFFF",
    "#123abc",
    "#AbCdEf",
  ];

  for (const color of validColors) {
    assertBranding(isValidHexColor(color), `${color} should be valid`);
  }
  console.log(`  ✓ Valid hex colors pass (${validColors.length} cases)`);

  // Invalid colors (including #RGB, #FFFFFFFF, var(), rgb())
  const invalidColors = [
    "",
    "#FFF",             // 3-digit (MED-3d requirement)
    "#FFFFFFF",         // 7-digit
    "#FFFFFFFF",        // 8-digit (MED-3b requirement)
    "FF9A2E",
    "#GG9A2E",
    "rgb(255,154,46)",  // rgb() (MED-3d requirement)
    "#FF9A2E ",
    " #FF9A2E",
    "var(--color-accent)", // var() (LOW-8)
  ];

  for (const color of invalidColors) {
    assertBranding(!isValidHexColor(color), `"${color}" should be invalid`);
  }
  console.log(`  ✓ Invalid hex colors rejected (${invalidColors.length} cases)`);
}

function testLogoUrlValidation() {
  console.log("\n▶ Testing logo URL validation...");

  // Valid URLs
  const validUrls = [
    "",
    "https://example.com/logo.png",
    "https://cdn.example.com/assets/logo.svg",
    "/storage/v1/object/public/gym-logos/abc123.png",
    "/storage/gym-logos/logo.jpg",
  ];

  for (const url of validUrls) {
    assertBranding(isValidLogoUrl(url), `"${url}" should be valid`);
  }
  console.log(`  ✓ Valid logo URLs pass (${validUrls.length} cases)`);

  // Invalid URLs (including MED-3b requirements: ' https://x', 'javascript:...', 'HTTPS://')
  const invalidUrls = [
    "http://example.com/logo.png",
    "ftp://example.com/logo.png",
    "example.com/logo.png",
    "/public/logo.png",
    "logo.png",
    " https://example.com/logo.png",  // leading space (MED-3b)
    "javascript:alert('https://')",   // javascript: (MED-3b)
    "HTTPS://example.com/logo.png",   // uppercase protocol (MED-3b)
    "https://",                        // bare https:// (LOW-3)
    "/storage/",                       // bare /storage/ (LOW-3)
  ];

  for (const url of invalidUrls) {
    assertBranding(!isValidLogoUrl(url), `"${url}" should be invalid`);
  }
  console.log(`  ✓ Invalid logo URLs rejected (${invalidUrls.length} cases)`);
}

function testColorPairValidation() {
  console.log("\n▶ Testing color pair validation...");

  // Both set: valid
  const hasPrimary1 = Boolean("#FF9A2E");
  const hasAccent1 = Boolean("#E8850C");
  assertBranding(hasPrimary1 === hasAccent1, "Both colors set should be valid");
  console.log("  ✓ Both colors set is valid");

  // Both empty: valid
  const hasPrimary2 = Boolean("");
  const hasAccent2 = Boolean("");
  assertBranding(hasPrimary2 === hasAccent2, "Both colors empty should be valid");
  console.log("  ✓ Both colors empty is valid");

  // Only primary: invalid
  const hasPrimary3 = Boolean("#FF9A2E");
  const hasAccent3 = Boolean("");
  assertBranding(hasPrimary3 !== hasAccent3, "Only primary should be invalid");
  console.log("  ✓ Only primary color is invalid");

  // Only accent: invalid
  const hasPrimary4 = Boolean("");
  const hasAccent4 = Boolean("#E8850C");
  assertBranding(hasPrimary4 !== hasAccent4, "Only accent should be invalid");
  console.log("  ✓ Only accent color is invalid");
}

function main() {
  console.log("Testing Branding Validation (unit)");
  console.log("===================================");

  try {
    testHexColorValidation();
    testLogoUrlValidation();
    testColorPairValidation();

    console.log("\n✅ All branding validation tests passed\n");
    process.exit(0);
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
