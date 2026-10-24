/**
 * Parse and validate the page query parameter for History pagination.
 * 
 * Handles invalid inputs (QA Bot 3 M4):
 * - Non-numeric strings (abc) → clamp to 1
 * - Zero or negative (0, -1) → clamp to 1
 * - Beyond total pages → clamp to last page
 * 
 * @param pageParam - Raw page param from URL (can be undefined, string, or number)
 * @param totalPages - Total number of pages available
 * @returns Parsed page number (1-indexed, clamped to valid range)
 */
export function parsePageParam(
  pageParam: string | undefined,
  totalPages: number
): number {
  const parsed = parseInt(pageParam ?? "1", 10);
  
  // Handle invalid parse (NaN from "abc", etc.)
  if (isNaN(parsed)) {
    return 1;
  }
  
  // Clamp to valid range [1, totalPages]
  if (parsed < 1) {
    return 1;
  }
  
  if (totalPages > 0 && parsed > totalPages) {
    return totalPages;
  }
  
  return parsed;
}
