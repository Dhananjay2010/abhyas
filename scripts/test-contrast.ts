/**
 * Test: Contrast calculation and WCAG AA compliance
 *
 * Verifies that the contrast utilities correctly compute WCAG 2.1 contrast ratios
 * and that the accessible text color function picks the most readable option.
 */

import {
  contrastRatio,
  accessibleTextColor,
  meetsWCAG_AA,
} from "../src/lib/contrast";

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

  // Orange (#f97316) on black (#0a0c0e): should be around 6.5:1
  const orangeBlack = contrastRatio("#f97316", "#0a0c0e");
  assert(orangeBlack >= 6.0 && orangeBlack <= 7.0, `Orange on black should be ~6.5:1, got ${orangeBlack.toFixed(2)}`);

  // Symmetry: order shouldn't matter
  const blackOrange = contrastRatio("#0a0c0e", "#f97316");
  assertClose(blackOrange, orangeBlack, 0.01, "Contrast ratio should be symmetric");

  console.log("  ✓ Black on white: 21:1 (maximum)");
  console.log("  ✓ White on white: 1:1 (minimum)");
  console.log(`  ✓ Orange on black: ${orangeBlack.toFixed(2)}:1`);
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
    accessibleTextColor("#f97316") === "#000000",
    "Orange background (#f97316) should get black text"
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
    meetsWCAG_AA("#f97316", "#0a0c0e"),
    "Orange on black should pass WCAG AA (6.5:1)"
  );

  // The old offline page had white (#ffffff) on green (#22c55e) at 2.28:1 (fail)
  assert(
    !meetsWCAG_AA("#ffffff", "#22c55e"),
    "White on green (#22c55e) should fail WCAG AA (2.28:1)"
  );

  // New offline page has black (#000000) on orange (#f97316)
  const orangeContrastWithBlack = contrastRatio("#f97316", "#000000");
  assert(
    meetsWCAG_AA("#000000", "#f97316"),
    `Black on orange should pass WCAG AA (${orangeContrastWithBlack.toFixed(2)}:1)`
  );
  assert(
    orangeContrastWithBlack >= 4.5,
    `Black on orange should be >= 4.5:1, got ${orangeContrastWithBlack.toFixed(2)}`
  );

  console.log("  ✓ Black on white passes (21:1)");
  console.log(`  ✓ Orange on black passes (${contrastRatio("#f97316", "#0a0c0e").toFixed(2)}:1)`);
  console.log("  ✓ White on green fails (2.28:1, as expected)");
  console.log(`  ✓ Black on orange passes (${orangeContrastWithBlack.toFixed(2)}:1)`);
}

function testBrandColorCompliance() {
  console.log("\n▶ Testing brand color compliance...");

  // The default brand accent is #f97316 (orange).
  // When used as a button background, black text should meet WCAG AA.
  const brandAccent = "#f97316";
  const textColor = accessibleTextColor(brandAccent);
  const ratio = contrastRatio(textColor, brandAccent);

  assert(
    meetsWCAG_AA(textColor, brandAccent),
    `Computed text color (${textColor}) on brand accent (${brandAccent}) should meet WCAG AA`
  );

  console.log(`  ✓ Brand accent: ${brandAccent}`);
  console.log(`  ✓ Accessible text color: ${textColor}`);
  console.log(`  ✓ Contrast ratio: ${ratio.toFixed(2)}:1 (>= 4.5:1)`);
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
