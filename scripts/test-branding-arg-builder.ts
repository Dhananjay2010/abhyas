/**
 * Test: Branding arg builder (unit)
 * 
 * Verifies that buildBrandingArgs correctly builds p_clear arrays
 * when fields are emptied, ensuring the UI can actually clear branding.
 * 
 * This test addresses MED-1: the bug where empty form fields never sent p_clear.
 */

import { buildBrandingArgs, type BrandingFormInput } from "../src/lib/gym/branding-args";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testAllFieldsSet() {
  console.log("\n▶ Testing all fields set...");

  const input: BrandingFormInput = {
    displayName: "My Gym",
    logoUrl: "https://example.com/logo.png",
    primaryColor: "#FF9A2E",
    accentColor: "#E8850C",
  };

  const args = buildBrandingArgs("gym-123", input);

  assert(args.p_gym_id === "gym-123", "gym_id should be set");
  assert(args.p_display_name === "My Gym", "display_name should be set");
  assert(args.p_logo_url === "https://example.com/logo.png", "logo_url should be set");
  assert(args.p_primary_color === "#FF9A2E", "primary_color should be set");
  assert(args.p_accent_color === "#E8850C", "accent_color should be set");
  assert(!args.p_clear || args.p_clear.length === 0, "p_clear should be empty");

  console.log("  ✓ All fields set correctly");
}

function testAllFieldsEmpty() {
  console.log("\n▶ Testing all fields empty (clear all)...");

  const input: BrandingFormInput = {
    displayName: "",
    logoUrl: "",
    primaryColor: "",
    accentColor: "",
  };

  const args = buildBrandingArgs("gym-123", input);

  assert(args.p_gym_id === "gym-123", "gym_id should be set");
  assert(args.p_display_name === undefined, "display_name should be undefined");
  assert(args.p_logo_url === undefined, "logo_url should be undefined");
  assert(args.p_primary_color === undefined, "primary_color should be undefined");
  assert(args.p_accent_color === undefined, "accent_color should be undefined");
  assert(Array.isArray(args.p_clear), "p_clear should be an array");
  assert(args.p_clear!.length === 4, "p_clear should have 4 entries");
  assert(args.p_clear!.includes("display_name"), "p_clear should include display_name");
  assert(args.p_clear!.includes("logo_url"), "p_clear should include logo_url");
  assert(args.p_clear!.includes("primary_color"), "p_clear should include primary_color");
  assert(args.p_clear!.includes("accent_color"), "p_clear should include accent_color");

  console.log("  ✓ All fields cleared correctly");
}

function testClearDisplayNameOnly() {
  console.log("\n▶ Testing clear display_name only...");

  const input: BrandingFormInput = {
    displayName: "",
    logoUrl: "https://example.com/logo.png",
    primaryColor: "#FF9A2E",
    accentColor: "#E8850C",
  };

  const args = buildBrandingArgs("gym-123", input);

  assert(args.p_display_name === undefined, "display_name should be undefined");
  assert(args.p_logo_url === "https://example.com/logo.png", "logo_url should be set");
  assert(args.p_primary_color === "#FF9A2E", "primary_color should be set");
  assert(args.p_accent_color === "#E8850C", "accent_color should be set");
  assert(Array.isArray(args.p_clear), "p_clear should be an array");
  assert(args.p_clear!.length === 1, "p_clear should have 1 entry");
  assert(args.p_clear![0] === "display_name", "p_clear should include display_name");

  console.log("  ✓ display_name cleared correctly");
}

function testClearLogoOnly() {
  console.log("\n▶ Testing clear logo_url only...");

  const input: BrandingFormInput = {
    displayName: "My Gym",
    logoUrl: "",
    primaryColor: "#FF9A2E",
    accentColor: "#E8850C",
  };

  const args = buildBrandingArgs("gym-123", input);

  assert(args.p_display_name === "My Gym", "display_name should be set");
  assert(args.p_logo_url === undefined, "logo_url should be undefined");
  assert(args.p_primary_color === "#FF9A2E", "primary_color should be set");
  assert(args.p_accent_color === "#E8850C", "accent_color should be set");
  assert(Array.isArray(args.p_clear), "p_clear should be an array");
  assert(args.p_clear!.length === 1, "p_clear should have 1 entry");
  assert(args.p_clear![0] === "logo_url", "p_clear should include logo_url");

  console.log("  ✓ logo_url cleared correctly");
}

function testClearColorsOnly() {
  console.log("\n▶ Testing clear both colors (pair rule)...");

  const input: BrandingFormInput = {
    displayName: "My Gym",
    logoUrl: "https://example.com/logo.png",
    primaryColor: "",
    accentColor: "",
  };

  const args = buildBrandingArgs("gym-123", input);

  assert(args.p_display_name === "My Gym", "display_name should be set");
  assert(args.p_logo_url === "https://example.com/logo.png", "logo_url should be set");
  assert(args.p_primary_color === undefined, "primary_color should be undefined");
  assert(args.p_accent_color === undefined, "accent_color should be undefined");
  assert(Array.isArray(args.p_clear), "p_clear should be an array");
  assert(args.p_clear!.length === 2, "p_clear should have 2 entries");
  assert(args.p_clear!.includes("primary_color"), "p_clear should include primary_color");
  assert(args.p_clear!.includes("accent_color"), "p_clear should include accent_color");

  console.log("  ✓ Both colors cleared correctly");
}

function testWhitespaceOnlyTreatedAsEmpty() {
  console.log("\n▶ Testing whitespace-only values treated as empty...");

  const input: BrandingFormInput = {
    displayName: "   ",
    logoUrl: "  ",
    primaryColor: " ",
    accentColor: "",
  };

  const args = buildBrandingArgs("gym-123", input);

  assert(Array.isArray(args.p_clear), "p_clear should be an array");
  assert(args.p_clear!.length === 4, "p_clear should have 4 entries for all whitespace fields");
  assert(args.p_clear!.includes("display_name"), "p_clear should include display_name");
  assert(args.p_clear!.includes("logo_url"), "p_clear should include logo_url");
  assert(args.p_clear!.includes("primary_color"), "p_clear should include primary_color");
  assert(args.p_clear!.includes("accent_color"), "p_clear should include accent_color");

  console.log("  ✓ Whitespace-only values treated as empty");
}

function main() {
  console.log("Testing Branding Arg Builder (unit)");
  console.log("====================================");

  try {
    testAllFieldsSet();
    testAllFieldsEmpty();
    testClearDisplayNameOnly();
    testClearLogoOnly();
    testClearColorsOnly();
    testWhitespaceOnlyTreatedAsEmpty();

    console.log("\n✅ All branding arg builder tests passed\n");
    console.log("MED-1 verified: p_clear is built correctly when fields are emptied");
    process.exit(0);
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
