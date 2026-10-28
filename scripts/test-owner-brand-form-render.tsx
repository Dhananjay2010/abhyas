#!/usr/bin/env tsx

/**
 * Test: Owner branding form renders preview swatches (LOW c)
 * 
 * Renders the branding form with low-contrast colors and verifies
 * the preview swatches show adjusted hex values (not raw inputs).
 * 
 * Mutants:
 * - Preview using raw accent (not adjusted)
 * - Preview text color from raw primary (not adjusted)
 * - Form ignoring computePreviewColors
 */

import { renderToStaticMarkup } from "react-dom/server";
import { BrandingForm } from "@/app/owner/branding/branding-form";
import { computePreviewColors } from "@/app/owner/branding/branding-form";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

async function testFormRendersAdjustedSwatches() {
  console.log("TEST: Form renders preview swatches with adjusted colors");
  
  // Test case 1: Dark primary (needs lightening)
  const darkPrimary = "#1E40AF";
  const darkAccent = "#1E3A8A";
  
  const darkResult = computePreviewColors(darkPrimary, darkAccent);
  console.log(`  Test 1 - Dark primary: ${darkPrimary} → Adjusted: ${darkResult.adjustedPrimary}`);
  console.log(`  Test 1 - Dark accent: ${darkAccent} → Adjusted: ${darkResult.adjustedAccent}`);
  console.log(`  Test 1 - Preview text color: ${darkResult.previewTextColor}`);
  
  // Test case 2: Medium-dark primary (may cross text color threshold)
  // This color is dark enough to need adjustment, but after adjustment
  // might become light enough to need a different text color
  const mediumPrimary = "#3b5998"; // Facebook blue - darker than adjusted target
  const mediumAccent = "#365899";
  
  const mediumResult = computePreviewColors(mediumPrimary, mediumAccent);
  console.log(`  Test 2 - Medium primary: ${mediumPrimary} → Adjusted: ${mediumResult.adjustedPrimary}`);
  console.log(`  Test 2 - Medium accent: ${mediumAccent} → Adjusted: ${mediumResult.adjustedAccent}`);
  console.log(`  Test 2 - Preview text color: ${mediumResult.previewTextColor}`);
  
  // Render form with dark colors
  const darkHtml = renderToStaticMarkup(
    <BrandingForm
      gymId="test-gym-id"
      gymName="Test Gym"
      initial={{
        gymName: "Test Gym",
        displayName: "",
        logoUrl: "",
        primaryColor: darkPrimary,
        accentColor: darkAccent,
      }}
    />
  );
  
  check("Dark: HTML contains color input swatches", darkHtml.includes('type="color"'));
  check("Dark: Preview contains adjusted primary", 
    darkResult.adjustedPrimary ? darkHtml.includes(darkResult.adjustedPrimary) : false,
    darkResult.adjustedPrimary || "null"
  );
  check("Dark: Preview contains adjusted accent",
    darkResult.adjustedAccent ? darkHtml.includes(darkResult.adjustedAccent) : false,
    darkResult.adjustedAccent || "null"
  );
  check("Dark: Preview contains text color from adjusted primary",
    darkResult.previewTextColor ? darkHtml.includes(darkResult.previewTextColor) : false,
    darkResult.previewTextColor || "null"
  );
  
  // Render form with medium colors
  const mediumHtml = renderToStaticMarkup(
    <BrandingForm
      gymId="test-gym-id"
      gymName="Test Gym"
      initial={{
        gymName: "Test Gym",
        displayName: "",
        logoUrl: "",
        primaryColor: mediumPrimary,
        accentColor: mediumAccent,
      }}
    />
  );
  
  check("Medium: HTML contains color input swatches", mediumHtml.includes('type="color"'));
  check("Medium: Preview contains adjusted primary", 
    mediumResult.adjustedPrimary ? mediumHtml.includes(mediumResult.adjustedPrimary) : false,
    mediumResult.adjustedPrimary || "null"
  );
  check("Medium: Preview contains adjusted accent",
    mediumResult.adjustedAccent ? mediumHtml.includes(mediumResult.adjustedAccent) : false,
    mediumResult.adjustedAccent || "null"
  );
  check("Medium: Preview contains text color from adjusted primary",
    mediumResult.previewTextColor ? mediumHtml.includes(mediumResult.previewTextColor) : false,
    mediumResult.previewTextColor || "null"
  );
  
  // Check preview sections exist
  check("Dark: Preview section exists", darkHtml.indexOf("Preview") > 0);
  check("Medium: Preview section exists", mediumHtml.indexOf("Preview") > 0);
  
  console.log("  Adjusted values should appear in preview swatches");
}

async function main() {
  await testFormRendersAdjustedSwatches();
  
  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed`);
    process.exit(1);
  }
  
  console.log("\n✅ All owner branding form render tests passed");
  console.log("\nLOW (c): Owner brand preview form renders with adjusted colors.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
