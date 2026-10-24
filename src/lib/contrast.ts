/**
 * Color contrast utilities for WCAG AA compliance.
 *
 * Computes accessible text colors for any background, ensuring at least
 * 4.5:1 contrast ratio for normal text (WCAG 2.1 Level AA).
 */

/**
 * Convert a hex color (#rrggbb) to relative luminance.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function hexToRelativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  const [r, g, b] = rgb.map((channel) => {
    const sRGB = channel / 255;
    return sRGB <= 0.04045
      ? sRGB / 12.92
      : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Convert a hex color to [r, g, b] array (0-255).
 */
function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace(/^#/, "");
  if (normalized.length !== 6) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return [r, g, b];
}

/**
 * Compute contrast ratio between two colors.
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 *
 * Returns a value >= 1. WCAG AA requires >= 4.5:1 for normal text.
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const L1 = hexToRelativeLuminance(hex1);
  const L2 = hexToRelativeLuminance(hex2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Choose black or white text for the given background color,
 * whichever has the highest contrast (and thus the best readability).
 *
 * Returns "#000000" or "#ffffff".
 */
export function accessibleTextColor(backgroundColor: string): string {
  const contrastWithBlack = contrastRatio(backgroundColor, "#000000");
  const contrastWithWhite = contrastRatio(backgroundColor, "#ffffff");
  return contrastWithBlack > contrastWithWhite ? "#000000" : "#ffffff";
}

/**
 * Check if the given foreground/background pair meets WCAG AA (4.5:1).
 */
export function meetsWCAG_AA(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= 4.5;
}
