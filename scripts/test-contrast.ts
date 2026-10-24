/**
 * Design token contrast ratios must meet WCAG AA.
 *
 * Input borders were 1.4:1 on the background, failing WCAG 1.4.11's 3:1 minimum.
 * This test verifies the border color meets 3:1 against all surface colors.
 *
 *   npx tsx scripts/test-contrast.ts
 */

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) throw new Error(`Invalid hex color: ${hex}`);
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  };
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const { r, g, b } = rgb;
  const [R, G, B] = [r, g, b].map((c) => {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(hex1: string, hex2: string): number {
  const L1 = relativeLuminance(hexToRgb(hex1));
  const L2 = relativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

const COLORS = {
  bg: "#0a0c0e",
  surface: "#151a1f",
  surface2: "#1d242b",
  border: "#607280",
};

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Border color meets 3:1 contrast against all surfaces");
{
  const bgRatio = contrastRatio(COLORS.border, COLORS.bg);
  const surfaceRatio = contrastRatio(COLORS.border, COLORS.surface);
  const surface2Ratio = contrastRatio(COLORS.border, COLORS.surface2);

  check(
    `border vs bg (${COLORS.border} vs ${COLORS.bg})`,
    bgRatio >= 3.0,
    `${bgRatio.toFixed(2)}:1`
  );
  check(
    `border vs surface (${COLORS.border} vs ${COLORS.surface})`,
    surfaceRatio >= 3.0,
    `${surfaceRatio.toFixed(2)}:1`
  );
  check(
    `border vs surface-2 (${COLORS.border} vs ${COLORS.surface2})`,
    surface2Ratio >= 3.0,
    `${surface2Ratio.toFixed(2)}:1`
  );
}

console.log("\n2. Text colors meet AA standards");
{
  const fgBg = contrastRatio("#ecf1f6", COLORS.bg);
  const mutedBg = contrastRatio("#93a1ae", COLORS.bg);
  const mutedSurface = contrastRatio("#93a1ae", COLORS.surface);

  check("fg vs bg", fgBg >= 7.0, `${fgBg.toFixed(2)}:1 (AAA large text)`);
  check("muted vs bg", mutedBg >= 4.5, `${mutedBg.toFixed(2)}:1 (AA normal text)`);
  check("muted vs surface (dimmed chips)", mutedSurface >= 4.5, `${mutedSurface.toFixed(2)}:1 (AA normal text)`);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
