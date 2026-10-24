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
 */
export function formatWeight(
  kg: number | null | undefined,
  units: string,
  includeLabel = true
): string {
  if (kg == null || kg < 0 || !Number.isFinite(kg)) {
    return includeLabel ? (units === "imperial" ? "0 lb" : "0 kg") : "0";
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
 */
export function formatHeight(
  cm: number | null | undefined,
  units: string,
  includeLabel = true
): string {
  if (cm == null || cm < 0 || !Number.isFinite(cm)) {
    return includeLabel ? (units === "imperial" ? `0'0"` : "0 cm") : "0";
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
 * @param input - User input string or number
 * @param units - 'metric' or 'imperial'
 * @returns Weight in kg, or null for invalid input
 */
export function parseWeight(
  input: string | number | null | undefined,
  units: string
): number | null {
  if (input == null || input === "") return null;

  const value = typeof input === "string" ? parseFloat(input.trim()) : input;

  if (!Number.isFinite(value) || value < 0) return null;

  if (units === "imperial") {
    // Round to 0.5 lb to match display format, then convert
    const roundedLb = roundLbToHalf(value);
    return lbToKg(roundedLb);
  }

  return value;
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
      const totalInches = feetAndInchesToInches(feet, inches);
      return inToCm(totalInches);
    }

    // If numeric input without separate inches, treat as total inches
    if (typeof input === "number") {
      if (!Number.isFinite(input) || input < 0) return null;
      return inToCm(input);
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
        const totalInches = feetAndInchesToInches(feet, inches);
        return inToCm(totalInches);
      }

      // Try with dash separator: "5-9"
      const dashMatch = str.match(/^(\d+)-(\d+)$/);
      if (dashMatch) {
        const feet = parseInt(dashMatch[1], 10);
        const inches = parseInt(dashMatch[2], 10);
        const totalInches = feetAndInchesToInches(feet, inches);
        return inToCm(totalInches);
      }

      // Single number treated as total inches
      const value = parseFloat(str);
      if (Number.isFinite(value) && value >= 0) {
        return inToCm(value);
      }
    }

    return null;
  }

  // Metric: single number in cm
  const value = typeof input === "string" ? parseFloat(input.trim()) : input;
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

/**
 * Get the user's units preference with a safe default.
 * Always returns 'metric' or 'imperial', never null/undefined.
 */
export function getUnitsPreference(
  units: string | null | undefined
): "metric" | "imperial" {
  if (units === "imperial") return "imperial";
  return "metric";
}
