#!/usr/bin/env tsx

/**
 * Test: Owner brand preview shows adjusted colors (LOW c)
 * 
 * Behavioral test using exported computePreviewColors function.
 * Verifies that the preview displays the lightened color members will actually see,
 * computed via ensureMinContrast with the same parameters as mergeBrand (3.0 ratio against app bg).
 * 
 * Mutant: Preview shows raw input color without adjustment.
 */

import { computePreviewColors } from "@/app/owner/branding/branding-form";
import { mergeBrand } from "@/lib/runtime-brand";
import { branding } from "@/lib/branding";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

async function testPreviewShowsAdjustedColor() {
  console.log("TEST: Preview computes adjusted color matching mergeBrand");
  
  // Use a dark blue that needs lightening (#1E40AF)
  const rawColor = "#1E40AF";
  
  // Get preview color from form
  const { adjustedPrimary } = computePreviewColors(rawColor, rawColor);
  
  // Get what mergeBrand produces (what members will actually see)
  const memberBrand = mergeBrand(branding, {
    colors: {
      ...branding.colors,
      accent: rawColor,
    },
  });
  
  const memberColor = memberBrand.colors.accent;
  
  check("Preview adjusted color matches mergeBrand output", adjustedPrimary === memberColor);
  check("Adjusted color differs from raw input", adjustedPrimary !== rawColor);
  check("Adjusted color is valid hex", adjustedPrimary ? /^#[0-9a-fA-F]{6}$/.test(adjustedPrimary) : false);
  
  console.log(`  Raw input: ${rawColor}`);
  console.log(`  Preview shows (adjusted): ${adjustedPrimary}`);
  console.log(`  Members see (mergeBrand): ${memberColor}`);
  console.log(`  Match: ${adjustedPrimary === memberColor ? '✓' : '✗'}`);
}

async function testPreviewUsesEnsureMinContrast() {
  console.log("\nTEST: Preview applies ensureMinContrast (not raw color)");
  
  // Test a color that needs significant adjustment
  const lowContrast = "#1E40AF"; // Dark blue
  
  const { adjustedPrimary, previewPrimary } = computePreviewColors(lowContrast, lowContrast);
  
  // Preview should show adjusted color, not raw
  check("Preview uses adjusted color (not raw)", adjustedPrimary !== lowContrast);
  check("previewPrimary equals adjustedPrimary", previewPrimary === adjustedPrimary);
  
  console.log(`  Input: ${lowContrast} → Adjusted: ${adjustedPrimary}`);
}

async function testHighContrastPassesThrough() {
  console.log("\nTEST: High-contrast colors pass through with minimal adjustment");
  
  // Already high contrast
  const highContrast = "#fbbf24"; // Yellow
  
  const { adjustedPrimary } = computePreviewColors(highContrast, highContrast);
  
  const memberBrand = mergeBrand(branding, {
    colors: {
      ...branding.colors,
      accent: highContrast,
    },
  });
  
  check("High-contrast color: preview matches mergeBrand", 
    adjustedPrimary === memberBrand.colors.accent);
  
  console.log(`  High-contrast ${highContrast} → ${adjustedPrimary}`);
}

async function testEmptyInputHandling() {
  console.log("\nTEST: Empty input returns CSS variable fallback");
  
  const { previewPrimary, adjustedPrimary } = computePreviewColors("", "");
  
  check("Empty input: adjustedPrimary is null", adjustedPrimary === null);
  check("Empty input: previewPrimary is CSS variable", previewPrimary === "var(--color-muted)");
  
  console.log(`  Empty → previewPrimary: ${previewPrimary}`);
}

async function main() {
  await testPreviewShowsAdjustedColor();
  await testPreviewUsesEnsureMinContrast();
  await testHighContrastPassesThrough();
  await testEmptyInputHandling();
  
  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed`);
    process.exit(1);
  }
  
  console.log("\n✅ All LOW (c) tests passed");
  console.log("\nLOW (c): Owner brand preview shows lightened color from ensureMinContrast.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
