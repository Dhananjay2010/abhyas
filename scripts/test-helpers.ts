/**
 * Narrow a possibly-undefined value to a defined one, or throw.
 * Use instead of non-null assertion `!` in tests.
 */
export function assertDefined<T>(value: T | null | undefined, name: string): T {
  if (value == null) {
    throw new Error(`Expected ${name} to be defined, got ${value}`);
  }
  return value;
}
