#!/usr/bin/env tsx

/**
 * Test: Accent-on-surface contrast (LOW a)
 * 
 * Verifies that accentOnSurface color meets WCAG AA (4.5:1) against card surface.
 * Tests mergeBrand computes accentOnSurface from accent with ensureAccentOnSurface.
 * 
 * Mutant: Skip accentOnSurface adjustment, use accent directly.
 */

import { strict as assert } from "assert";
import { mergeBrand } from "@/lib/runtime-brand";
import { branding, type Brand } from "@/lib/branding";
import { contrastRatio } from "@/lib/contrast";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

async function testAccentOnSurfaceContrast() {
  console.log("TEST: accentOnSurface meets WCAG AA (4.5:1) against surface");
  
  // Test with a low-contrast accent color that needs adjustment
  // #1E40AF (blue-800) has ~2.8:1 against #151a1f surface - needs boost
  const lowContrastPartial: Partial<Brand> = {
    colors: {
      ...branding.colors,
      accent: "#1E40AF", // Blue that NEEDS adjustment for surface
    },
  };
  
  const merged = mergeBrand(branding, lowContrastPartial);
  
  // Check that accentOnSurface exists
  assert.ok(merged.colors.accentOnSurface, "accentOnSurface should be defined");
  
  // Check contrast against surface
  const contrastVsSurface = contrastRatio(merged.colors.accentOnSurface, branding.colors.surface);
  
  check(
    "accentOnSurface has >= 4.5:1 contrast against surface",
    contrastVsSurface >= 4.5,
    `ratio: ${contrastVsSurface.toFixed(2)}:1`
  );
  
  console.log(`  Original accent: ${lowContrastPartial.colors?.accent ?? 'N/A'}`);
  console.log(`  Adjusted accentOnSurface: ${merged.colors.accentOnSurface}`);
  console.log(`  Contrast ratio: ${contrastVsSurface.toFixed(2)}:1`);
}

async function testHighContrastAccentUnchanged() {
  console.log("\nTEST: High-contrast accent already passes, minimal adjustment");
  
  // Test with an already high-contrast accent
  const highContrastPartial: Partial<Brand> = {
    colors: {
      ...branding.colors,
      accent: "#fbbf24", // Yellow with good contrast
    },
  };
  
  const merged = mergeBrand(branding, highContrastPartial);
  
  const contrastVsSurface = contrastRatio(merged.colors.accentOnSurface, branding.colors.surface);
  
  check(
    "High-contrast accent: accentOnSurface >= 4.5:1",
    contrastVsSurface >= 4.5,
    `ratio: ${contrastVsSurface.toFixed(2)}:1`
  );
}

async function testAccentOnSurfaceInBrandType() {
  console.log("\nTEST: accentOnSurface is present in base brand");
  
  check("Base brand has accentOnSurface", 
    typeof branding.colors.accentOnSurface === "string"
  );
  
  check("accentOnSurface is valid hex",
    /^#[0-9a-fA-F]{6}$/.test(branding.colors.accentOnSurface)
  );
}

async function main() {
  await testAccentOnSurfaceInBrandType();
  await testAccentOnSurfaceContrast();
  await testHighContrastAccentUnchanged();
  
  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed`);
    process.exit(1);
  }
  
  console.log("\n✅ All accent-on-surface contrast tests passed");
  console.log("\nLOW (a): Accent text on cards now meets WCAG AA (4.5:1).");
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
