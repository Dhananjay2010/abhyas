/**
 * Format large numbers with proper thousands separators and units.
 *
 * FIX (d): Volume showed '15t' for 14,800 kg. This shows full numbers with
 * thousands separators: '14,800 kg' or '32,628 lb' when the user prefers lb.
 *
 * Reuses #102's conversion and formatting, rounding sensibly.
 */

import { kgToLb, type UnitsPreference } from "@/lib/units";

/**
 * Format volume for display with full numbers and thousands separators.
 *
 * - Metric: '14,800 kg'
 * - Imperial: '32,628 lb' (rounded to nearest whole pound)
 *
 * Never abbreviates with 't' or 'k'.
 */
export function formatVolumeLifted(
  volumeKg: number,
  units: UnitsPreference,
): string {
  if (!Number.isFinite(volumeKg) || volumeKg <= 0) {
    return units === "imperial" ? "0 lb" : "0 kg";
  }

  if (units === "imperial") {
    const lb = kgToLb(volumeKg);
    const rounded = Math.round(lb);
    const formatted = rounded.toLocaleString("en-US");
    return `${formatted} lb`;
  }

  // Metric: round to nearest kg
  const rounded = Math.round(volumeKg);
  const formatted = rounded.toLocaleString("en-US");
  return `${formatted} kg`;
}
