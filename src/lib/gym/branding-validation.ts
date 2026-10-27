/**
 * Branding validation utilities (shared between client and server)
 */

/**
 * Validate a hex color (6-digit, case-insensitive)
 */
export function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
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
