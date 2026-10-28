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

async function testBaseBrandAccentNeedsAdjustment() {
  console.log("\nTEST: Base brand accent fails 4.5:1, mergeBrand sets accentOnSurface");
  
  // Create a brand where the base accent itself fails 4.5:1 on surface
  const baseBrand: Brand = {
    ...branding,
    colors: {
      ...branding.colors,
      accent: "#2563eb", // Blue-600 - low contrast on dark surface
    },
  };
  
  // Check that the base accent fails 4.5:1
  const baseContrast = contrastRatio(baseBrand.colors.accent, baseBrand.colors.surface);
  check("Base accent fails 4.5:1 on surface", baseContrast < 4.5, `${baseContrast.toFixed(2)}:1`);
  
  // mergeBrand with empty partial should still compute accentOnSurface
  const merged = mergeBrand(baseBrand, {});
  
  const mergedContrast = contrastRatio(merged.colors.accentOnSurface, merged.colors.surface);
  check("mergeBrand sets accentOnSurface >= 4.5:1", mergedContrast >= 4.5, `${mergedContrast.toFixed(2)}:1`);
  check("accentOnSurface differs from base accent", merged.colors.accentOnSurface !== baseBrand.colors.accent);
  
  console.log(`  Base accent: ${baseBrand.colors.accent} (${baseContrast.toFixed(2)}:1)`);
  console.log(`  Adjusted accentOnSurface: ${merged.colors.accentOnSurface} (${mergedContrast.toFixed(2)}:1)`);
}

async function testLayoutCssContainsAdjustedValue() {
  console.log("\nTEST: Layout CSS contains adjusted accentOnSurface for low-contrast accent");
  
  const { getBrandCssVariables } = await import("@/lib/branding");
  
  // Merge brand with low-contrast accent to get adjusted accentOnSurface
  const merged = mergeBrand(branding, { colors: { ...branding.colors, accent: "#1E40AF" } });
  
  // Get CSS variables
  const cssVars = getBrandCssVariables(merged);
  
  // Verify accentOnSurface is in the CSS
  check("CSS vars include --color-accent-on-surface", cssVars.includes("--color-accent-on-surface:"));
  
  // Verify the adjusted value is in the CSS
  const expectedVar = `--color-accent-on-surface: ${merged.colors.accentOnSurface};`;
  check("CSS contains adjusted accentOnSurface value", cssVars.includes(expectedVar), expectedVar);
  
  console.log(`  Adjusted value in CSS: ${merged.colors.accentOnSurface}`);
}

async function main() {
  await testAccentOnSurfaceInBrandType();
  await testAccentOnSurfaceContrast();
  await testHighContrastAccentUnchanged();
  await testBaseBrandAccentNeedsAdjustment();
  await testLayoutCssContainsAdjustedValue();
  
  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed`);
    process.exit(1);
  }
  
  console.log("\n✅ All accent-on-surface contrast tests passed");
  console.log("\nLOW (a): Accent text on cards now meets WCAG AA (4.5:1).");
  console.log("accentOnSurface is emitted as --color-accent-on-surface CSS variable.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
