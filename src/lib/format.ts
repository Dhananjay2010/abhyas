/**
 * Number formatting utilities.
 *
 * Shared formatters for displaying numbers consistently across the app.
 */

/**
 * Format a number with thousands separators using Indian numbering system.
 *
 * Examples:
 * - 1234 → "1,234"
 * - 12345 → "12,345"
 * - 123456 → "1,23,456"
 *
 * @param value - The number to format
 * @returns Formatted string with thousands separators
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}
