/**
 * Unit conversion and formatting for weight and height.
 *
 * The database stores everything in metric (kg, cm). This module converts to
 * and from imperial for display and input parsing, with round-trip stability:
 * a stored value displayed and then edited without change must parse back to
 * the same stored value.
 *
 * Usage in UI code:
 *
 *   const units = profile.units || 'metric';
 *   const displayWeight = formatWeight(profile.weight_kg, units);
 *   const displayHeight = formatHeight(profile.height_cm, units);
 *
 *   // On form submit:
 *   const weight_kg = parseWeight(input, units);
 *   const height_cm = parseHeight(input, units);
 */

// ============================================================
// CONSTANTS
// ============================================================

const KG_TO_LB = 2.20462262185;
const LB_TO_KG = 1 / KG_TO_LB;
const CM_TO_IN = 0.393700787402;
const IN_TO_CM = 1 / CM_TO_IN;
const IN_PER_FT = 12;

// ============================================================
// WEIGHT CONVERSION
// ============================================================

/**
 * Convert kilograms to pounds.
 * Returns 0 for invalid input (null, undefined, negative, NaN).
 */
export function kgToLb(kg: number | null | undefined): number {
  if (kg == null || kg < 0 || !Number.isFinite(kg)) return 0;
  return kg * KG_TO_LB;
}

/**
 * Convert pounds to kilograms.
 * Returns 0 for invalid input (null, undefined, negative, NaN).
 */
export function lbToKg(lb: number | null | undefined): number {
  if (lb == null || lb < 0 || !Number.isFinite(lb)) return 0;
  return lb * LB_TO_KG;
}

/**
 * Round pounds to the nearest 0.5 lb.
 * This is the display format for imperial weight.
 */
export function roundLbToHalf(lb: number): number {
  return Math.round(lb * 2) / 2;
}

// ============================================================
// HEIGHT CONVERSION
// ============================================================

/**
 * Convert centimeters to total inches.
 * Returns 0 for invalid input.
 */
export function cmToIn(cm: number | null | undefined): number {
  if (cm == null || cm < 0 || !Number.isFinite(cm)) return 0;
  return cm * CM_TO_IN;
}

/**
 * Convert inches to centimeters.
 * Returns 0 for invalid input.
 */
export function inToCm(inches: number | null | undefined): number {
  if (inches == null || inches < 0 || !Number.isFinite(inches)) return 0;
  return inches * IN_TO_CM;
}

/**
 * Convert total inches to feet and inches.
 * Properly carries 12 inches into 1 foot.
 * Example: 71.6 inches → { feet: 6, inches: 0 } (rounded to whole inches)
 */
export function inchesToFeetAndInches(totalInches: number): {
  feet: number;
  inches: number;
} {
  if (!Number.isFinite(totalInches) || totalInches < 0) {
    return { feet: 0, inches: 0 };
  }

  const roundedInches = Math.round(totalInches);
  const feet = Math.floor(roundedInches / IN_PER_FT);
  const inches = roundedInches % IN_PER_FT;

  return { feet, inches };
}

/**
 * Convert feet and inches to total inches.
 */
export function feetAndInchesToInches(feet: number, inches: number): number {
  if (!Number.isFinite(feet) || !Number.isFinite(inches)) return 0;
  if (feet < 0 || inches < 0) return 0;
  return feet * IN_PER_FT + inches;
}

// ============================================================
// DISPLAY FORMATTING
// ============================================================

/**
 * Format weight for display with appropriate units.
 * Imperial: rounded to nearest 0.5 lb
 * Metric: displayed as-is (1 decimal place if needed)
 *
 * @param kg - Weight in kilograms (canonical storage format)
 * @param units - 'metric' or 'imperial'
 * @param includeLabel - Whether to include unit label (default: true)
 * @param emptyValue - Value to return for missing/invalid input (default: em dash "—")
 */
export function formatWeight(
  kg: number | null | undefined,
  units: string,
  includeLabel = true,
  emptyValue = "—"
): string {
  if (kg == null || kg <= 0 || !Number.isFinite(kg)) {
    return emptyValue;
  }

  if (units === "imperial") {
    const lb = roundLbToHalf(kgToLb(kg));
    const formatted = lb % 1 === 0 ? lb.toFixed(0) : lb.toFixed(1);
    return includeLabel ? `${formatted} lb` : formatted;
  }

  // Metric: show 1 decimal if needed
  const formatted = kg % 1 === 0 ? kg.toFixed(0) : kg.toFixed(1);
  return includeLabel ? `${formatted} kg` : formatted;
}

/**
 * Format height for display with appropriate units.
 * Imperial: feet'inches" format (e.g., 5'9")
 * Metric: cm with 1 decimal place if needed
 *
 * @param cm - Height in centimeters (canonical storage format)
 * @param units - 'metric' or 'imperial'
 * @param includeLabel - Whether to include unit label (default: true)
 * @param emptyValue - Value to return for missing/invalid input (default: em dash "—")
 */
export function formatHeight(
  cm: number | null | undefined,
  units: string,
  includeLabel = true,
  emptyValue = "—"
): string {
  if (cm == null || cm <= 0 || !Number.isFinite(cm)) {
    return emptyValue;
  }

  if (units === "imperial") {
    const totalInches = cmToIn(cm);
    const { feet, inches } = inchesToFeetAndInches(totalInches);
    return `${feet}'${inches}"`;
  }

  // Metric: show 1 decimal if needed
  const formatted = cm % 1 === 0 ? cm.toFixed(0) : cm.toFixed(1);
  return includeLabel ? `${formatted} cm` : formatted;
}

/**
 * Get the unit label for weight.
 */
export function weightLabel(units: string): string {
  return units === "imperial" ? "lb" : "kg";
}

/**
 * Get the unit label for height.
 */
export function heightLabel(units: string): string {
  return units === "imperial" ? `ft'in"` : "cm";
}

// ============================================================
// INPUT PARSING
// ============================================================

/**
 * Parse weight input and convert to canonical kg.
 * Handles both metric and imperial input.
 *
 * For imperial: rounds to nearest 0.5 lb before converting to kg.
 * This ensures round-trip stability: display → input → storage → display
 * produces the same value unless the user changed it.
 *
 * Rejects absurd values: weight must be between 0.1 and 500 kg (0.2–1100 lb).
 *
 * @param input - User input string or number
 * @param units - 'metric' or 'imperial'
 * @returns Weight in kg, or null for invalid input
 */
export function parseWeight(
  input: string | number | null | undefined,
  units: string
): number | null {
  if (input == null || input === "") return null;

  let value: number;

  if (typeof input === "string") {
    const trimmed = input.trim();
    // Allow optional trailing unit: "70kg", "154.5 lb", "154.5lb"
    const match = trimmed.match(/^(\d+\.?\d*)\s*(kg|lb|lbs)?$/i);
    if (!match) return null;
    value = Number(match[1]);
  } else {
    value = input;
  }

  if (!Number.isFinite(value) || value <= 0) return null;

  let kg: number;
  if (units === "imperial") {
    // Round to 0.5 lb to match display format, then convert
    const roundedLb = roundLbToHalf(value);
    kg = lbToKg(roundedLb);
  } else {
    kg = value;
  }

  // Reject absurd values: 0.1 to 500 kg (0.2 to ~1100 lb)
  if (kg < 0.1 || kg > 500) return null;

  return kg;
}

/**
 * Parse height input and convert to canonical cm.
 *
 * For metric input: accepts a single number (cm).
 * For imperial input: accepts formats like:
 *   - "5'9"" or "5'9"
 *   - "5' 9"" or "5' 9"
 *   - "5 9" or "5-9"
 *   - Two separate numbers (feet and inches)
 *
 * Imperial parsing rounds to whole inches to match display format.
 * Rejects absurd values: height must be between 50 and 272 cm (~1'8" to 8'11").
 * Rejects inches >= 12 in split-input form.
 *
 * @param input - User input (string for imperial, number for metric)
 * @param units - 'metric' or 'imperial'
 * @param inputInches - For imperial: separate inches input (optional)
 * @returns Height in cm, or null for invalid input
 */
export function parseHeight(
  input: string | number | null | undefined,
  units: string,
  inputInches?: number | null
): number | null {
  if (input == null || input === "") return null;

  if (units === "imperial") {
    // If separate feet/inches inputs provided
    if (typeof input === "number" && inputInches != null) {
      const feet = input;
      const inches = inputInches;
      if (!Number.isFinite(feet) || !Number.isFinite(inches)) return null;
      if (feet < 0 || inches < 0) return null;
      // Reject inches >= 12 in split form
      if (inches >= 12) return null;
      const totalInches = feetAndInchesToInches(feet, inches);
      const cm = inToCm(totalInches);
      // Reject absurd values: 50 to 272 cm
      if (cm < 50 || cm > 272) return null;
      return cm;
    }

    // If numeric input without separate inches, treat as total inches
    if (typeof input === "number") {
      if (!Number.isFinite(input) || input < 0) return null;
      const cm = inToCm(input);
      if (cm < 50 || cm > 272) return null;
      return cm;
    }

    // Parse string formats: "5'9\"", "5' 9\"", "5 9", "5-9"
    if (typeof input === "string") {
      const str = input.trim();

      // Try feet'inches" format: requires apostrophe or space separator
      // Matches: "5'9", "5' 9", "5'9\"", "5' 9\"", "5 9"
      const feetInchMatch = str.match(/^(\d+)[''\s]\s*(\d+)"?$/);
      if (feetInchMatch) {
        const feet = parseInt(feetInchMatch[1], 10);
        const inches = parseInt(feetInchMatch[2], 10);
        // Reject inches >= 12 in split form
        if (inches >= 12) return null;
        const totalInches = feetAndInchesToInches(feet, inches);
        const cm = inToCm(totalInches);
        if (cm < 50 || cm > 272) return null;
        return cm;
      }

      // Try with dash separator: "5-9"
      const dashMatch = str.match(/^(\d+)-(\d+)$/);
      if (dashMatch) {
        const feet = parseInt(dashMatch[1], 10);
        const inches = parseInt(dashMatch[2], 10);
        // Reject inches >= 12 in split form
        if (inches >= 12) return null;
        const totalInches = feetAndInchesToInches(feet, inches);
        const cm = inToCm(totalInches);
        if (cm < 50 || cm > 272) return null;
        return cm;
      }

      // Single number treated as total inches (strict parsing)
      const match = str.match(/^(\d+\.?\d*)\s*(in|inch|inches)?$/i);
      if (match) {
        const value = Number(match[1]);
        if (Number.isFinite(value) && value >= 0) {
          const cm = inToCm(value);
          if (cm < 50 || cm > 272) return null;
          return cm;
        }
      }
    }

    return null;
  }

  // Metric: single number in cm (strict parsing)
  let value: number;
  if (typeof input === "string") {
    const trimmed = input.trim();
    // Allow optional trailing unit: "175cm", "175 cm"
    const match = trimmed.match(/^(\d+\.?\d*)\s*(cm)?$/i);
    if (!match) return null;
    value = Number(match[1]);
  } else {
    value = input;
  }

  if (!Number.isFinite(value) || value <= 0) return null;

  // Reject absurd values: 50 to 272 cm
  if (value < 50 || value > 272) return null;

  return value;
}

export type UnitsPreference = "metric" | "imperial";

/**
 * Get the user's units preference with a safe default.
 * Always returns 'metric' or 'imperial', never null/undefined.
 *
 * @param units - The stored units value from the user's profile
 * @param fallback - Fallback value if units is invalid (default: 'metric')
 *                   In production, pass the gym's defaultUnits from branding config
 * @returns A valid units preference
 */
export function getUnitsPreference(
  units: string | null | undefined,
  fallback: UnitsPreference = "metric"
): UnitsPreference {
  if (units === "imperial" || units === "metric") return units;
  return fallback;
}
