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

  // The brand accent is #22c55e (green).
  // When used as a button background, the computed text color should meet WCAG AA.
  const brandAccent = "#22c55e";
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
