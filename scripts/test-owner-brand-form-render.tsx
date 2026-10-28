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
  
  const rawPrimary = "#1E40AF"; // Dark blue needing adjustment
  const rawAccent = "#1E3A8A";  // Even darker blue needing adjustment
  
  // Compute expected adjusted values
  const { adjustedPrimary, adjustedAccent, previewTextColor } = computePreviewColors(rawPrimary, rawAccent);
  
  console.log(`  Raw primary: ${rawPrimary} → Adjusted: ${adjustedPrimary}`);
  console.log(`  Raw accent: ${rawAccent} → Adjusted: ${adjustedAccent}`);
  console.log(`  Preview text color: ${previewTextColor}`);
  
  // Render form with low-contrast primary and accent
  const html = renderToStaticMarkup(
    <BrandingForm
      gymId="test-gym-id"
      gymName="Test Gym"
      initial={{
        gymName: "Test Gym",
        displayName: "",
        logoUrl: "",
        primaryColor: rawPrimary,
        accentColor: rawAccent,
      }}
    />
  );
  
  // The form should use the adjusted colors in the preview swatches (type="color" inputs)
  // The adjusted primary should be #2f56c7 (or similar) for 3.0:1 on #0a0c0e
  check("HTML contains color input swatches", html.includes('type="color"'));
  
  // Check that adjusted primary appears in the preview (not raw)
  check("Preview contains adjusted primary", 
    adjustedPrimary ? html.includes(adjustedPrimary) : false,
    adjustedPrimary || "null"
  );
  
  // Check that adjusted accent appears in the preview (not raw)
  check("Preview contains adjusted accent",
    adjustedAccent ? html.includes(adjustedAccent) : false,
    adjustedAccent || "null"
  );
  
  // Check that preview text color appears (computed from adjusted, not raw primary)
  check("Preview contains text color from adjusted primary",
    previewTextColor ? html.includes(previewTextColor) : false,
    previewTextColor || "null"
  );
  
  // Check that preview section exists
  const previewSection = html.indexOf("Preview");
  check("Preview section exists", previewSection > 0);
  if (previewSection > 0) {
    console.log("  Preview section found");
  }
  
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
