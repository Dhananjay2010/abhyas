/**
 * Branding validation utilities (shared between client and server)
 */

import { contrastRatio } from "@/lib/contrast";
import { branding } from "@/lib/branding";

/**
 * Validate a hex color (6-digit, case-insensitive)
 */
export function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

/**
 * Check if primary color needs a contrast warning (< 3:1 vs app background)
 * Returns warning message if contrast is too low, null otherwise
 */
export function primaryContrastWarning(primaryHex: string): string | null {
  if (!primaryHex || !isValidHexColor(primaryHex)) {
    return null;
  }
  
  const appBackground = branding.colors.bg;
  const ratio = contrastRatio(primaryHex, appBackground);
  
  if (ratio < 3.0) {
    return "This colour is too dark for the app background, so members will see a lighter shade.";
  }
  
  return null;
}

/**
 * Validate a logo URL (https:// or /storage/)
 * LOW-4: Reject .. (path traversal) and control characters
 */
export function isValidLogoUrl(url: string): boolean {
  if (!url) return true; // empty is OK (will be cleared)
  const trimmed = url.trim();
  if (trimmed.length === 0) return false; // whitespace-only is invalid
  if (trimmed !== url) return false; // reject leading/trailing whitespace
  
  // Reject path traversal (..)
  if (trimmed.includes("..")) return false;
  
  // Reject control characters (ASCII 0-31, 127)
  // Check each character code instead of regex
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if ((code >= 0x00 && code <= 0x1F) || code === 0x7F) {
      return false;
    }
  }
  
  
  return (trimmed.startsWith("https://") && trimmed.length > 8) || 
         (trimmed.startsWith("/storage/") && trimmed.length > 9);
}
