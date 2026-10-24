/**
 * Format chart values with thousands separators.
 * 
 * Provides exact formatting (no rounding) for headlines/readouts,
 * and rounded formatting for axis ticks.
 */

/**
 * Format a value exactly (no rounding) with thousands separators.
 * Used for chart headlines, readouts, and aria-labels where precision matters.
 * 
 * @param v - The numeric value to format
 * @param unit - Optional unit label (e.g., "kg")
 * @returns Formatted string with separators (e.g., "11,850 kg")
 */
export function formatValueExact(v: number, unit: string): string {
  // For exact display, don't round - just use toLocaleString
  const formatted = v.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${formatted}${unit ? ` ${unit}` : ""}`;
}

/**
 * Format a value with rounding and thousands separators.
 * Used for axis ticks where rounded values are acceptable.
 * 
 * Values >= 100: rounded to integer
 * Values < 100: rounded to 1 decimal place
 * 
 * @param v - The numeric value to format
 * @param unit - Optional unit label (e.g., "kg")
 * @returns Formatted string with separators (e.g., "12,000 kg")
 */
export function formatValueRounded(v: number, unit: string): string {
  const rounded = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  const formatted = rounded.toLocaleString("en-US");
  return `${formatted}${unit ? ` ${unit}` : ""}`;
}
