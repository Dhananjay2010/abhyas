/**
 * Shared exercise exclusions for safety.
 * 
 * These exercises are excluded from both plan generation and swap suggestions
 * due to safety concerns (behind-the-neck bar positions, guillotine press variant, etc.)
 */

export const EXCLUDED_EXERCISE_SLUGS: ReadonlySet<string> = new Set([
  "standing-barbell-press-behind-neck",
  "wide-grip-pulldown-behind-the-neck",
  "wide-grip-rear-pull-up",
  "barbell-guillotine-bench-press",
  "neck-press",
]);
