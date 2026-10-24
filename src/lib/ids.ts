/**
 * UUID validation utilities.
 */

/**
 * Test whether a string is a valid UUID (any version, case-insensitive).
 * 
 * @param value - The string to test
 * @returns true if the value is a valid UUID format
 */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
