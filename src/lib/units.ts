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
 * Converts to user's units and shows up to one decimal place.
 * Trailing .0 is dropped (22.5kg shows as "22.5kg", 23.0kg shows as "23kg").
 * 
 * @param weightKg - Weight in kilograms
 * @param units - 'metric' or 'imperial'
 * @returns Formatted string like "22.5kg top" or "220lb top"
 */
export function formatTopSet(weightKg: number, units: UnitsPreference = "metric"): string {
  let weight = weightKg;
  if (units === "imperial") {
    weight = kgToLb(weightKg);
  }
  
  // Round to 1 decimal place
  const rounded = Math.round(weight * 10) / 10;
  // Format: drop trailing .0, otherwise show 1 decimal
  const numStr = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
  
  // Add thousands separators
  const [intPart, decPart] = numStr.split(".");
  const withSeparators = Number(intPart).toLocaleString("en-US");
  const formatted = decPart ? `${withSeparators}.${decPart}` : withSeparators;
  
  const label = units === "imperial" ? "lb" : "kg";
  return `${formatted} ${label} top`;
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
  units: UnitsPreference
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

  // Round to 1 decimal place (done before validation)
  const roundedKg = Math.round(kg * 10) / 10;
  
  // Validate body weight bounds (unit-specific, inclusive in display units)
  let effectiveUnits: UnitsPreference;
  if (explicitUnit === "lb" || explicitUnit === "lbs") {
    effectiveUnits = "imperial";
  } else if (explicitUnit === "kg") {
    effectiveUnits = "metric";
  } else {
    effectiveUnits = units ?? "metric";
  }
  if (!validateBodyWeightKg(roundedKg, effectiveUnits)) return null;

  return roundedKg;
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
// LOAD CONVERSION AND FORMATTING
// ============================================================

/**
 * Convert kg to display unit (kg or lb).
 * 
 * @param kg - Weight in kilograms
 * @param units - 'metric' or 'imperial'
 * @returns Weight in the display unit
 */
export function kgToDisplay(kg: number | null | undefined, units: UnitsPreference): number {
  if (kg == null || !Number.isFinite(kg)) return 0;
  return units === "imperial" ? kgToLb(kg) : kg;
}

/**
 * Convert from display unit to kg.
 * Input is rounded to appropriate precision before conversion.
 * 
 * For imperial: rounds the lb value AFTER conversion to maintain
 * round-trip stability: user enters 135 lb → stores as exact kg equivalent
 * → displays back as 135 lb.
 * 
 * For metric: identity conversion - stores exactly what was typed.
 * 
 * @param value - Weight in display unit (kg or lb)
 * @param units - 'metric' | 'imperial'
 * @returns Weight in kilograms, rounded to 0.01 kg precision
 */
export function displayToKg(value: number | null | undefined, units: UnitsPreference): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  
  if (units === "imperial") {
    // Convert directly, then round to 0.01 kg precision
    // This ensures round-trip stability: 135 lb → 61.23 kg → 135 lb
    const kg = lbToKg(value);
    return Math.round(kg * 100) / 100;
  }
  
  // Metric: identity - store exactly what was typed, rounded to 0.01 kg
  return Math.round(value * 100) / 100;
}

/**
 * Format a load (weight) with unit label.
 * 
 * @param kg - Weight in kilograms (canonical storage)
 * @param units - 'metric' or 'imperial'
 * @returns Formatted string like "135 lb" or "60 kg"
 */
export function formatLoad(kg: number | null | undefined, units: UnitsPreference): string {
  if (kg == null || !Number.isFinite(kg) || kg <= 0) return "—";
  
  const value = kgToDisplay(kg, units);
  const label = units === "imperial" ? "lb" : "kg";
  
  if (units === "imperial") {
    // Round to 0.5 lb for display
    const rounded = roundLbToHalf(value);
    const formatted = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
    return `${formatted} ${label}`;
  }
  
  // Metric: display exactly as stored, up to 2 decimal places
  // Drop trailing zeros: 11.25 kg, 63.75 kg, 8.75 kg, 9 kg
  const rounded = Math.round(value * 100) / 100;
  const formatted = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2).replace(/\.?0+$/, '');
  return `${formatted} ${label}`;
}

/**
 * Round a value to standard plate/weight increments.
 * Uses 2.5 kg / 5 lb step (smallest standard plate).
 * 
 * @param value - Weight value in the display unit
 * @param units - 'metric' or 'imperial'
 * @returns Rounded value in the same unit
 */
export function roundToPlate(value: number | null | undefined, units: UnitsPreference): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  
  const step = units === "imperial" ? 5 : 2.5;
  const halfStep = step / 2;
  const epsilon = 1e-9;
  
  // Find the two nearest grid points
  const lowerMultiple = Math.floor(value / step);
  const lowerValue = lowerMultiple * step;
  const upperValue = (lowerMultiple + 1) * step;
  
  // Calculate distance to midpoint
  const midpoint = lowerValue + halfStep;
  const distanceToMidpoint = value - midpoint;
  
  // Determine rounding direction
  let result: number;
  if (distanceToMidpoint < -epsilon) {
    // Below midpoint: round down
    result = lowerValue;
  } else if (distanceToMidpoint > epsilon) {
    // Above midpoint: round up
    result = upperValue;
  } else {
    // At midpoint (tie): round down for safety
    result = lowerValue;
  }
  
  return Math.max(0, result);
}

/**
 * Tolerance for rounding lb values to the 0.5 lb grid.
 * Handles floating-point imprecision from kg→lb→storage(0.01 kg)→lb round-trip.
 * Without this, 135 lb (61.23 kg) reads back as 134.989 lb and floors to 134.5.
 * The value 0.05 safely handles the worst-case round-trip error (~0.02 lb).
 */
const SNAP_LB_EPSILON = 0.05;

/**
 * Convert prescribed kg to the display unit and snap to the appropriate grid.
 * 
 * For imperial: converts kg to lb and snaps DOWN to 0.5 lb increments to avoid
 * false PBs when logging the prefilled value. Rounds down conservatively so
 * logging the prefilled value never exceeds the prescription.
 * For metric: returns kg as-is (identity).
 * 
 * Use this for BOTH working weight display and prefill to ensure they agree.
 * 
 * @param prescribedKg - Prescribed weight in kilograms
 * @param units - 'metric' or 'imperial'
 * @returns Snapped weight in kg
 */
export function snapPrescribedWeight(prescribedKg: number | null | undefined, units: UnitsPreference): number | null {
  if (prescribedKg == null || !Number.isFinite(prescribedKg) || prescribedKg <= 0) return null;
  
  if (units === "imperial") {
    // Convert to lb, snap DOWN to 0.5 lb grid (conservative), convert back to kg
    const lb = kgToLb(prescribedKg);
    // Floor to nearest 0.5 lb with tolerance to handle round-trip imprecision
    const snappedLb = Math.floor(lb * 2 + SNAP_LB_EPSILON) / 2;
    return Math.round(lbToKg(snappedLb) * 100) / 100;
  }
  
  // Metric: identity
  return prescribedKg;
}

// ============================================================
// VALIDATION
// ============================================================

// Validation bounds (must match server-side validation in actions.ts)
export const HEIGHT_CM_MIN = 100;
export const HEIGHT_CM_MAX = 250;
export const WEIGHT_KG_MIN = 25;
export const WEIGHT_KG_MAX = 300;

// Body weight bounds (inclusive in display units)
export const BODY_WEIGHT_LB_MIN = 55;
export const BODY_WEIGHT_LB_MAX = 661;

// Load input max (for runner and History edit)
export const LOAD_IMPERIAL_MAX_LB = 999;
export const LOAD_METRIC_MAX_KG = 500;

// Epsilon for imperial load validation (handles rounding: 999 lb → 453.14 kg → 999.0027 lb)
export const LOAD_LB_EPSILON = 0.01;

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
 * Validate body weight in kg with unit-specific bounds.
 * Used by both parseWeight and logBodyWeight for consistent validation.
 * 
 * Imperial: validates 55-661 lb inclusive (checks in display units)
 * Metric: validates 25-300 kg
 * 
 * @param kg - Weight in kilograms
 * @param units - User's units preference
 * @returns true if valid, false otherwise
 */
export function validateBodyWeightKg(kg: number | null, units: UnitsPreference): boolean {
  if (kg == null || !Number.isFinite(kg)) return false;
  
  if (units === "imperial") {
    // Check in display units with rounding to handle parseWeight's 0.1 kg rounding
    // 55 lb → 24.948 kg → rounds to 24.9 kg → back to 54.9 lb (rounded to 55 lb)
    const displayLb = roundLbToHalf(kgToLb(kg));
    return displayLb >= BODY_WEIGHT_LB_MIN && displayLb <= BODY_WEIGHT_LB_MAX;
  }
  
  // Metric: direct kg bounds
  return kg >= WEIGHT_KG_MIN && kg <= WEIGHT_KG_MAX;
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

/**
 * Convert a user-entered weight value to kg for storage.
 * Used by History edit and any form that accepts weight input in display units.
 * 
 * @param displayValue - The numeric value entered by the user
 * @param units - The user's units preference
 * @returns The value in kg, suitable for storage
 */
export function convertWeightInputToKg(
  displayValue: number,
  units: UnitsPreference
): number {
  if (units === "metric") {
    return displayValue;
  }
  // Imperial: convert lb to kg
  return displayToKg(displayValue, units);
}

/**
 * Compute the initial value for the weight input in the session runner.
 * For bodyweight exercises, only prefills if there's actual added weight.
 * For imperial units, snaps the prescribed weight to the lb grid before converting.
 * 
 * @param defaultWeightKg - The prescribed weight in kg (or last logged weight)
 * @param units - The user's units preference
 * @param isBodyweight - Whether this is a bodyweight exercise
 * @returns The string value for the weight input, or empty string if no prefill
 */
export function computeRunnerWeightPrefill(
  defaultWeightKg: number | null,
  units: UnitsPreference,
  isBodyweight: boolean
): string {
  // For bodyweight exercises, only prefill if the last set actually used added weight.
  const shouldPrefillWeight = !isBodyweight || (defaultWeightKg !== null && defaultWeightKg > 0);
  
  if (!shouldPrefillWeight || defaultWeightKg === null) return "";
  
  if (units === "metric") {
    // Metric: show exact kg value, no rounding
    return String(defaultWeightKg);
  }
  
  // Imperial: snap to 0.5 lb grid first (same as working weight line)
  const snappedKg = snapPrescribedWeight(defaultWeightKg, units);
  if (snappedKg === null) return "";
  const displayValue = kgToDisplay(snappedKg, units);
  const rounded = roundLbToHalf(displayValue);
  return String(rounded);
}
