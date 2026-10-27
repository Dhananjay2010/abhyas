/**
 * Brand contrast helpers with OKLCH lightness adjustment.
 * 
 * Ensures brand colors meet minimum contrast ratios by raising OKLCH lightness
 * in deterministic steps while preserving hue and chroma.
 */

import { contrastRatio } from "./contrast";

/**
 * Convert hex color to sRGB linear [0-1] for each channel.
 */
function hexToLinearRGB(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  
  const toLinear = (c: number) => {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  
  return [toLinear(r), toLinear(g), toLinear(b)];
}

/**
 * Convert linear sRGB [0-1] to hex color.
 * Clamps to [0-1] gamut.
 */
function linearRGBToHex(r: number, g: number, b: number): string {
  const fromLinear = (c: number) => {
    c = Math.max(0, Math.min(1, c));
    return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  };
  
  const rr = Math.round(fromLinear(r) * 255);
  const gg = Math.round(fromLinear(g) * 255);
  const bb = Math.round(fromLinear(b) * 255);
  
  return `#${rr.toString(16).padStart(2, '0')}${gg.toString(16).padStart(2, '0')}${bb.toString(16).padStart(2, '0')}`;
}

/**
 * Convert linear sRGB to OKLCH.
 * Uses OKlab as intermediate step.
 */
function linearRGBToOKLCH(r: number, g: number, b: number): { L: number; C: number; H: number } {
  // sRGB to OKLab (linear RGB to LMS to Lab)
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  
  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const b_ = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
  
  // OKLab to OKLCH
  const C = Math.sqrt(a * a + b_ * b_);
  let H = Math.atan2(b_, a) * (180 / Math.PI);
  if (H < 0) H += 360;
  
  return { L, C, H };
}

/**
 * Convert OKLCH to linear sRGB.
 * Gamut-clamps to [0-1] deterministically.
 */
function oklchToLinearRGB(L: number, C: number, H: number): [number, number, number] {
  // OKLCH to OKLab
  const hRad = H * (Math.PI / 180);
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);
  
  // OKLab to linear RGB
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  
  let r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let b_ = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  
  // Gamut clamp deterministically
  r = Math.max(0, Math.min(1, r));
  g = Math.max(0, Math.min(1, g));
  b_ = Math.max(0, Math.min(1, b_));
  
  return [r, g, b_];
}

/**
 * Ensure a color meets minimum contrast against a background.
 * 
 * If the color is under minRatio against bgHex, raises OKLCH lightness in
 * fixed steps (0.01) while keeping hue and chroma constant. Gamut-clamps
 * to sRGB deterministically. Falls back to fallbackHex if L reaches 1.0
 * without passing minRatio.
 * 
 * @param hex - Color to adjust (6-digit hex, e.g. "#1E40AF")
 * @param bgHex - Background color (6-digit hex, e.g. "#0a0c0e")
 * @param minRatio - Minimum contrast ratio (e.g. 3.0)
 * @param fallbackHex - Fallback if adjustment fails
 * @returns Adjusted hex color or fallback
 */
export function ensureMinContrast(
  hex: string,
  bgHex: string,
  minRatio: number,
  fallbackHex: string
): string {
  // Check if already passes
  const currentRatio = contrastRatio(hex, bgHex);
  if (currentRatio >= minRatio) {
    return hex;
  }
  
  // Convert to OKLCH
  const [r, g, b] = hexToLinearRGB(hex);
  const oklch = linearRGBToOKLCH(r, g, b);
  
  // Raise lightness in fixed steps
  const step = 0.01;
  const maxL = 1.0;
  
  let { L, C, H } = oklch;
  
  while (L < maxL) {
    L += step;
    if (L > maxL) L = maxL;
    
    // Convert back to hex
    const [rr, gg, bb] = oklchToLinearRGB(L, C, H);
    const adjusted = linearRGBToHex(rr, gg, bb);
    
    // Check contrast
    const ratio = contrastRatio(adjusted, bgHex);
    if (ratio >= minRatio) {
      return adjusted;
    }
  }
  
  // Failed to reach minRatio
  return fallbackHex;
}
