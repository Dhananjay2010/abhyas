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
    // Round to 1 decimal place
    const rounded = Math.round(lb * 10) / 10;
    const formatted = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
    return includeLabel ? `${formatted} lb` : formatted;
  }

  // Metric: round to 1 decimal place
  const rounded = Math.round(kg * 10) / 10;
  const formatted = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
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
    // Both feet and inches are already whole numbers from inchesToFeetAndInches
    return `${feet}'${inches}"`;
  }

  // Metric: round to integer cm
  const rounded = Math.round(cm);
  const formatted = rounded.toFixed(0);
  return includeLabel ? `${formatted} cm` : formatted;
}

/**
 * Format volume for display (B7).
 * - Below 100,000: full number with commas (e.g., "11,500 kg")
 * - 100,000+: abbreviated with "k" and 1 decimal (e.g., "115.2k kg")
 * - Never uses tonnes ("t")
 * - Converts to imperial when appropriate
 *
 * @param volumeKg - Volume in kilograms
 * @param units - 'metric' or 'imperial'
 * @returns Formatted volume string
 */
export function formatVolume(volumeKg: number, units: UnitsPreference = "metric"): string {
  if (!Number.isFinite(volumeKg) || volumeKg <= 0) return "0 kg";
  
  let value = volumeKg;
  let label = "kg";
  
  if (units === "imperial") {
    value = kgToLb(volumeKg);
    label = "lb";
  }
  
  if (value >= 100000) {
    // Abbreviated with k
    const k = value / 1000;
    return `${k.toFixed(1)}k ${label}`;
  } else {
    // Full number with commas
    const rounded = Math.round(value);
    const formatted = rounded.toLocaleString("en-US");
    return `${formatted} ${label}`;
  }
}

/**
 * Format top set weight for History display.
 * Converts to user's units and rounds for display.
 * 
 * @param weightKg - Weight in kilograms
 * @param units - 'metric' or 'imperial'
 * @returns Formatted string like "220lb top" or "100kg top"
 */
export function formatTopSet(weightKg: number, units: UnitsPreference = "metric"): string {
  const weight = units === "imperial" ? kgToLb(weightKg) : weightKg;
  const label = units === "imperial" ? "lb" : "kg";
  return `${Math.round(weight)}${label} top`;
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
 * Rejects absurd values: weight must be between 20 and 500 kg (~44–1100 lb).
 * Bounds aligned with server-side validation.
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
  let explicitUnit: string | null = null;

  if (typeof input === "string") {
    const trimmed = input.trim();
    // Allow optional trailing unit: "70kg", "154.5 lb", "154.5lb"
    const match = trimmed.match(/^(\d+\.?\d*)\s*(kg|lb|lbs)?$/i);
    if (!match) return null;
    value = Number(match[1]);
    explicitUnit = match[2] ? match[2].toLowerCase() : null;
  } else {
    value = input;
  }

  if (!Number.isFinite(value) || value <= 0) return null;

  let kg: number;
  
  // Handle explicit unit suffix
  if (explicitUnit) {
    if (explicitUnit === "kg") {
      kg = value;
    } else if (explicitUnit === "lb" || explicitUnit === "lbs") {
      // Convert lb to kg explicitly
      const roundedLb = roundLbToHalf(value);
      kg = lbToKg(roundedLb);
    } else {
      return null;
    }
  } else {
    // No explicit unit: use the units parameter
    if (units === "imperial") {
      // Round to 0.5 lb to match display format, then convert
      const roundedLb = roundLbToHalf(value);
      kg = lbToKg(roundedLb);
    } else {
      kg = value;
    }
  }

  // Reject absurd values: 25 to 300 kg (~55 to ~661 lb)
  // Bounds aligned with server-side validation
  if (kg < WEIGHT_KG_MIN || kg > WEIGHT_KG_MAX) return null;

  // Round to 1 decimal place
  return Math.round(kg * 10) / 10;
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
 * Rejects absurd values: height must be between 100 and 250 cm (~3'3" to 8'2").
 * Bounds aligned with server-side validation.
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
      // Reject absurd values: 100 to 250 cm (aligned with server validation)
      if (cm < HEIGHT_CM_MIN || cm > HEIGHT_CM_MAX) return null;
      return Math.round(cm);
    }

    // If numeric input without separate inches, treat as total inches
    if (typeof input === "number") {
      if (!Number.isFinite(input) || input < 0) return null;
      const cm = inToCm(input);
      if (cm < HEIGHT_CM_MIN || cm > HEIGHT_CM_MAX) return null;
      return Math.round(cm);
    }

    // Parse string formats: "5'9\"", "5' 9\"", "5 9", "5-9"
    if (typeof input === "string") {
      const str = input.trim();

      // Try feet'inches" format: accepts apostrophe, curly apostrophe, prime mark, or space separator
      // Matches: "5'9", "5'9", "5′9", "5' 9", "5'9\"", "5'9"", "5′9″", etc.
      const feetInchMatch = str.match(/^(\d+)[''\u2032\s]\s*(\d+)[""\u2033]?$/);
      if (feetInchMatch) {
        const feet = parseInt(feetInchMatch[1], 10);
        const inches = parseInt(feetInchMatch[2], 10);
        // Reject inches >= 12 in split form
        if (inches >= 12) return null;
        const totalInches = feetAndInchesToInches(feet, inches);
        const cm = inToCm(totalInches);
        if (cm < HEIGHT_CM_MIN || cm > HEIGHT_CM_MAX) return null;
        return Math.round(cm);
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
        if (cm < HEIGHT_CM_MIN || cm > HEIGHT_CM_MAX) return null;
        return Math.round(cm);
      }

      // Single number treated as total inches (strict parsing)
      const match = str.match(/^(\d+\.?\d*)\s*(in|inch|inches)?$/i);
      if (match) {
        const value = Number(match[1]);
        if (Number.isFinite(value) && value >= 0) {
          const cm = inToCm(value);
          if (cm < HEIGHT_CM_MIN || cm > HEIGHT_CM_MAX) return null;
          return Math.round(cm);
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

  // Reject absurd values: 100 to 250 cm (aligned with server validation)
  if (value < HEIGHT_CM_MIN || value > HEIGHT_CM_MAX) return null;

  return Math.round(value);
}

export type UnitsPreference = "metric" | "imperial";

// ============================================================
// VALIDATION
// ============================================================

// Validation bounds (must match server-side validation in actions.ts)
export const HEIGHT_CM_MIN = 100;
export const HEIGHT_CM_MAX = 250;
export const WEIGHT_KG_MIN = 25;
export const WEIGHT_KG_MAX = 300;

/**
 * Validate height in centimeters.
 * Rejects NaN, Infinity, non-numbers, and out-of-range values.
 * Valid range: 100-250 cm (aligned with server-side validation).
 *
 * @param cm - Height value to validate
 * @returns true if valid, false otherwise
 */
export function isValidHeightCm(cm: unknown): cm is number {
  if (typeof cm !== "number") return false;
  if (!Number.isFinite(cm)) return false;
  if (cm < HEIGHT_CM_MIN || cm > HEIGHT_CM_MAX) return false;
  return true;
}

/**
 * Validate weight in kilograms.
 * Rejects NaN, Infinity, non-numbers, and out-of-range values.
 * Valid range: 25-300 kg (aligned with server-side validation).
 *
 * @param kg - Weight value to validate
 * @returns true if valid, false otherwise
 */
export function isValidWeightKg(kg: unknown): kg is number {
  if (typeof kg !== "number") return false;
  if (!Number.isFinite(kg)) return false;
  if (kg < WEIGHT_KG_MIN || kg > WEIGHT_KG_MAX) return false;
  return true;
}

/**
 * Validate date of birth.
 * Checks for valid date format, realistic year range, and not in the future.
 *
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns true if valid, false otherwise
 */
export function isValidDateOfBirth(dateString: string): boolean {
  if (!dateString || typeof dateString !== "string") return false;
  
  // Check format: YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;
  
  const date = new Date(dateString);
  // Check if date is valid (not Invalid Date)
  if (isNaN(date.getTime())) return false;
  
  // Verify that parsing didn't change the date (e.g., 2020-02-30 -> 2020-03-01)
  const [yearStr, monthStr, dayStr] = dateString.split("-");
  if (date.getUTCFullYear() !== parseInt(yearStr, 10)) return false;
  if (date.getUTCMonth() !== parseInt(monthStr, 10) - 1) return false;
  if (date.getUTCDate() !== parseInt(dayStr, 10)) return false;
  
  // Check year is 4 digits (1000-9999)
  const year = date.getFullYear();
  if (year < 1000 || year > 9999) return false;
  
  // Check year is in sane range (1900 to current year)
  const currentYear = new Date().getFullYear();
  if (year < 1900 || year > currentYear) return false;
  
  // Check date is not in the future
  if (date > new Date()) return false;
  
  return true;
}

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
