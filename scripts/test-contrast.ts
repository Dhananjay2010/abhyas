/**
 * Test: Contrast calculation and WCAG AA compliance
 *
 * Verifies that the contrast utilities correctly compute WCAG 2.1 contrast ratios
 * and that the accessible text color function picks the most readable option.
 *
 * Brand color tests read from branding config so they hold for any brand.
 */

import {
  contrastRatio,
  accessibleTextColor,
  meetsWCAG_AA,
} from "../src/lib/contrast";
import { branding } from "../src/lib/branding";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function assertClose(actual: number, expected: number, tolerance: number, message: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`❌ ${message} (got ${actual.toFixed(2)}, expected ${expected.toFixed(2)})`);
  }
}

function testContrastRatio() {
  console.log("\n▶ Testing contrast ratio calculation...");

  // Black on white: 21:1 (maximum possible contrast)
  const blackWhite = contrastRatio("#000000", "#ffffff");
  assertClose(blackWhite, 21, 0.01, "Black on white should be 21:1");

  // White on white: 1:1 (minimum possible contrast)
  const whiteWhite = contrastRatio("#ffffff", "#ffffff");
  assertClose(whiteWhite, 1, 0.01, "White on white should be 1:1");

  // Green (#22c55e) on black (#0a0c0e): should be around 8-9:1
  const greenBlack = contrastRatio("#22c55e", "#0a0c0e");
  assert(greenBlack >= 7.5 && greenBlack <= 9.5, `Green on black should be ~8-9:1, got ${greenBlack.toFixed(2)}`);

  // Symmetry: order shouldn't matter
  const blackGreen = contrastRatio("#0a0c0e", "#22c55e");
  assertClose(blackGreen, greenBlack, 0.01, "Contrast ratio should be symmetric");

  console.log("  ✓ Black on white: 21:1 (maximum)");
  console.log("  ✓ White on white: 1:1 (minimum)");
  console.log(`  ✓ Green on black: ${greenBlack.toFixed(2)}:1`);
  console.log("  ✓ Contrast calculation is symmetric");
}

function testAccessibleTextColor() {
  console.log("\n▶ Testing accessible text color selection...");

  // Light backgrounds should get black text
  assert(
    accessibleTextColor("#ffffff") === "#000000",
    "White background should get black text"
  );
  assert(
    accessibleTextColor("#22c55e") === "#000000",
    "Green background (#22c55e) should get black text"
  );

  // Dark backgrounds should get white text
  assert(
    accessibleTextColor("#000000") === "#ffffff",
    "Black background should get white text"
  );
  assert(
    accessibleTextColor("#0a0c0e") === "#ffffff",
    "App background (#0a0c0e) should get white text"
  );

  // Mid-tone: test the decision boundary
  // #767676 has luminance ~0.21, close to the boundary
  const midTone = accessibleTextColor("#767676");
  assert(
    midTone === "#000000" || midTone === "#ffffff",
    "Mid-tone should pick black or white"
  );

  console.log("  ✓ Light backgrounds get black text");
  console.log("  ✓ Dark backgrounds get white text");
  console.log("  ✓ Mid-tones make a valid choice");
}

function testWCAG_AA() {
  console.log("\n▶ Testing WCAG AA compliance (4.5:1 minimum)...");

  // Passing combinations
  assert(
    meetsWCAG_AA("#000000", "#ffffff"),
    "Black on white should pass WCAG AA"
  );
  assert(
    meetsWCAG_AA("#22c55e", "#0a0c0e"),
    "Green on black should pass WCAG AA (8-9:1)"
  );

  // White on green has poor contrast (2.28:1) - should fail
  assert(
    !meetsWCAG_AA("#ffffff", "#22c55e"),
    "White on green (#22c55e) should fail WCAG AA (2.28:1)"
  );

  // Black on green (#22c55e) has excellent contrast
  const greenContrastWithBlack = contrastRatio("#22c55e", "#000000");
  assert(
    meetsWCAG_AA("#000000", "#22c55e"),
    `Black on green should pass WCAG AA (${greenContrastWithBlack.toFixed(2)}:1)`
  );
  assert(
    greenContrastWithBlack >= 4.5,
    `Black on green should be >= 4.5:1, got ${greenContrastWithBlack.toFixed(2)}`
  );

  // Dark (#0a0c0e) on green also has excellent contrast
  const greenContrastWithDark = contrastRatio("#22c55e", "#0a0c0e");
  assert(
    meetsWCAG_AA("#0a0c0e", "#22c55e"),
    `Dark on green should pass WCAG AA (${greenContrastWithDark.toFixed(2)}:1)`
  );

  console.log("  ✓ Black on white passes (21:1)");
  console.log(`  ✓ Green on black passes (${contrastRatio("#22c55e", "#0a0c0e").toFixed(2)}:1)`);
  console.log("  ✓ White on green fails (2.28:1, as expected)");
  console.log(`  ✓ Black on green passes (${greenContrastWithBlack.toFixed(2)}:1)`);
  console.log(`  ✓ Dark on green passes (${greenContrastWithDark.toFixed(2)}:1)`);
}

function testBrandColorCompliance() {
  console.log("\n▶ Testing brand color compliance...");

  // Read all brand colors from branding config
  const brandAccent = branding.colors.accent;
  const brandAccentHover = branding.colors.accentHover;
  const brandAccentFg = branding.colors.accentFg;
  const brandBg = branding.colors.bg;
  const brandFg = branding.colors.fg;
  const brandMuted = branding.colors.muted;

  // Test button colors (accentFg text on accent background)
  const buttonContrast = contrastRatio(brandAccentFg, brandAccent);
  assert(
    meetsWCAG_AA(brandAccentFg, brandAccent),
    `Button text (${brandAccentFg} on ${brandAccent}) should meet WCAG AA (got ${buttonContrast.toFixed(2)}:1)`
  );
  assert(
    buttonContrast >= 4.5,
    `Button contrast should be >= 4.5:1, got ${buttonContrast.toFixed(2)}:1`
  );

  // Test button hover colors (accentFg text on accentHover background)
  const buttonHoverContrast = contrastRatio(brandAccentFg, brandAccentHover);
  assert(
    meetsWCAG_AA(brandAccentFg, brandAccentHover),
    `Button hover text (${brandAccentFg} on ${brandAccentHover}) should meet WCAG AA (got ${buttonHoverContrast.toFixed(2)}:1)`
  );

  // Test page text (fg on bg)
  const pageContrast = contrastRatio(brandFg, brandBg);
  assert(
    meetsWCAG_AA(brandFg, brandBg),
    `Page text (${brandFg} on ${brandBg}) should meet WCAG AA (got ${pageContrast.toFixed(2)}:1)`
  );

  // Test muted text (muted on bg)
  const mutedContrast = contrastRatio(brandMuted, brandBg);
  assert(
    meetsWCAG_AA(brandMuted, brandBg),
    `Muted text (${brandMuted} on ${brandBg}) should meet WCAG AA (got ${mutedContrast.toFixed(2)}:1)`
  );

  console.log(`  ✓ Brand accent: ${brandAccent}`);
  console.log(`  ✓ Brand accent hover: ${brandAccentHover}`);
  console.log(`  ✓ Brand accent foreground: ${brandAccentFg}`);
  console.log(`  ✓ Button contrast: ${buttonContrast.toFixed(2)}:1 (>= 4.5:1)`);
  console.log(`  ✓ Button hover contrast: ${buttonHoverContrast.toFixed(2)}:1 (>= 4.5:1)`);
  console.log(`  ✓ Page text (${brandFg} on ${brandBg}): ${pageContrast.toFixed(2)}:1`);
  console.log(`  ✓ Muted text (${brandMuted} on ${brandBg}): ${mutedContrast.toFixed(2)}:1`);
}

function main() {
  console.log("Testing Contrast Calculation");
  console.log("============================");

  try {
    testContrastRatio();
    testAccessibleTextColor();
    testWCAG_AA();
    testBrandColorCompliance();

    console.log("\n✅ All contrast tests passed\n");
    process.exit(0);
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
