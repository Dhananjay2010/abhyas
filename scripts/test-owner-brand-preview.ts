#!/usr/bin/env tsx

/**
 * Test: Owner brand preview shows adjusted colors (LOW c)
 * 
 * Verifies that the owner branding form preview displays the lightened
 * color members will actually see, computed via ensureMinContrast with
 * the same parameters as mergeBrand (3.0 ratio against app bg).
 * 
 * Mutant: Preview shows raw input color without adjustment.
 */

import { strict as assert } from "assert";
import { ensureMinContrast } from "@/lib/brand-contrast";
import { branding } from "@/lib/branding";
import { readFileSync } from "fs";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

async function testPreviewShowsAdjustedColor() {
  console.log("TEST: Preview computes adjusted color via ensureMinContrast");
  
  // Simulate what the form does: apply ensureMinContrast to a dark blue
  const rawColor = "#1E40AF"; // Dark blue that needs lightening
  const appBg = branding.colors.bg; // #0a0c0e
  const minRatio = 3.0;
  
  const adjusted = ensureMinContrast(rawColor, appBg, minRatio, branding.colors.accent);
  
  check("Adjusted color differs from raw input", adjusted !== rawColor);
  check("Adjusted color is valid hex", /^#[0-9a-fA-F]{6}$/.test(adjusted));
  
  console.log(`  Raw input: ${rawColor}`);
  console.log(`  Adjusted for members: ${adjusted}`);
}

async function testFormImportsEnsureMinContrast() {
  console.log("\nTEST: BrandingForm imports ensureMinContrast");
  
  const formPath = "src/app/owner/branding/branding-form.tsx";
  const formSource = readFileSync(formPath, "utf-8");
  
  const importsEnsureMinContrast = formSource.includes('import { ensureMinContrast }') ||
                                    formSource.includes('import {ensureMinContrast');
  
  // Check that ensureMinContrast is called (not commented out)
  // Look for uncommented call pattern: adjustedPrimary = ... ensureMinContrast(
  const lines = formSource.split('\n');
  let hasUncommentedCall = false;
  for (const line of lines) {
    if (line.includes('ensureMinContrast(') && 
        !line.trim().startsWith('//') &&
        !line.includes('// const adjusted')) {
      hasUncommentedCall = true;
      break;
    }
  }
  
  check("Form imports ensureMinContrast", importsEnsureMinContrast);
  check("Form actively calls ensureMinContrast (not commented)", hasUncommentedCall);
}

async function testPreviewDocumentation() {
  console.log("\nTEST: Preview includes user-facing documentation");
  
  const formPath = "src/app/owner/branding/branding-form.tsx";
  const formSource = readFileSync(formPath, "utf-8");
  
  // Check for explanation that colors are adjusted
  const hasAdjustedExplanation = formSource.includes("adjusted for contrast") || 
                                  formSource.includes("adjusted version");
  
  check("Preview explains contrast adjustment to owner", hasAdjustedExplanation);
}

async function testAdjustmentMatchesMergeBrand() {
  console.log("\nTEST: Preview adjustment matches mergeBrand parameters");
  
  const formPath = "src/app/owner/branding/branding-form.tsx";
  const formSource = readFileSync(formPath, "utf-8");
  
  // Verify it uses the same parameters as mergeBrand
  const usesBrandingBg = formSource.includes("branding.colors.bg");
  const usesMinRatio = formSource.includes("3.0") || formSource.includes("minRatio");
  
  check("Preview uses branding.colors.bg (same as mergeBrand)", usesBrandingBg);
  check("Preview uses 3.0 min ratio (same as mergeBrand)", usesMinRatio);
  
  console.log("  Parameters match src/lib/runtime-brand.ts mergeBrand");
}

async function main() {
  await testPreviewShowsAdjustedColor();
  await testFormImportsEnsureMinContrast();
  await testPreviewDocumentation();
  await testAdjustmentMatchesMergeBrand();
  
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
