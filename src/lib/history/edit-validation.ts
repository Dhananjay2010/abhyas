/**
 * Validation rules for History edit actions.
 *
 * Extracted for unit testing. All validations return { valid: true } or { valid: false, error: "message" }.
 * Messages are plain sentences suitable for inline display, never raw Postgres errors.
 */

import { localDateString } from "@/lib/dates";
import { utcToZonedDateTime } from "@/lib/timezone";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate set reps: must be an integer from 1 to 100.
 */
export function validateReps(reps: number | null): ValidationResult {
  if (reps === null) {
    return { valid: true };
  }
  if (!Number.isInteger(reps)) {
    return { valid: false, error: "Reps must be a whole number." };
  }
  if (reps < 1) {
    return { valid: false, error: "Reps must be between 1 and 100." };
  }
  if (reps > 100) {
    return { valid: false, error: "Reps must be between 1 and 100." };
  }
  return { valid: true };
}

/**
 * Validate set weight: must be a finite number from 0 to 500 kg with at most 2 decimals.
 */
export function validateWeightKg(weightKg: number | null): ValidationResult {
  if (weightKg === null) {
    return { valid: true };
  }
  if (!Number.isFinite(weightKg)) {
    return { valid: false, error: "Weight must be a valid number." };
  }
  if (weightKg < 0) {
    return { valid: false, error: "Weight must be between 0 and 500 kg." };
  }
  if (weightKg > 500) {
    return { valid: false, error: "Weight must be between 0 and 500 kg." };
  }
  // Check at most 2 decimals
  const decimals = (weightKg.toString().split(".")[1] || "").length;
  if (decimals > 2) {
    return { valid: false, error: "Weight can have at most 2 decimal places." };
  }
  return { valid: true };
}

/**
 * Validate that at least one metric (reps or weight) is present for non-duration sets.
 * Duration-metric sets have their own rules and are not checked here.
 */
export function validateSetMetrics(
  reps: number | null,
  weightKg: number | null,
  durationSeconds: number | null
): ValidationResult {
  // If it's a duration-based set, skip this check
  if (durationSeconds !== null) {
    return { valid: true };
  }
  // For reps/weight sets, at least one must be non-null
  if (reps === null && weightKg === null) {
    return { valid: false, error: "At least reps or weight must be provided." };
  }
  return { valid: true };
}

/**
 * Validate local_date is not in the future (in the member's timezone).
 */
export function validateDateNotFuture(
  localDate: string,
  timezone: string
): ValidationResult {
  const today = localDateString(timezone);
  if (localDate > today) {
    return { valid: false, error: "That date is in the future." };
  }
  return { valid: true };
}

/**
 * Validate local_date is not before the member's signup date.
 */
export function validateDateAfterSignup(
  localDate: string,
  signupDate: string,
  timezone: string
): ValidationResult {
  // Convert signup timestamp to local date in the member's timezone
  const signupLocalDate = utcToZonedDateTime(signupDate, timezone).date;
  if (localDate < signupLocalDate) {
    return { valid: false, error: "That date is before your signup date." };
  }
  return { valid: true };
}

/**
 * Validate that startedAt and completedAt are not null or empty.
 */
export function validateTimestampsPresent(
  startedAt: string | null,
  completedAt: string | null
): ValidationResult {
  if (!startedAt || startedAt.trim() === "") {
    return { valid: false, error: "Start time is required." };
  }
  if (!completedAt || completedAt.trim() === "") {
    return { valid: false, error: "End time is required." };
  }
  return { valid: true };
}

/**
 * Validate that timestamps are parseable as dates.
 */
export function validateTimestampsParseable(
  startedAt: string,
  completedAt: string
): ValidationResult {
  const startMs = new Date(startedAt).getTime();
  if (isNaN(startMs)) {
    return { valid: false, error: "Start time is not a valid date." };
  }
  const endMs = new Date(completedAt).getTime();
  if (isNaN(endMs)) {
    return { valid: false, error: "End time is not a valid date." };
  }
  return { valid: true };
}

/**
 * Validate that local_date agrees with the local date of started_at in the member's timezone.
 */
export function validateLocalDateMatchesStartedAt(
  localDate: string,
  startedAt: string,
  timezone: string
): ValidationResult {
  const startedAtLocalDate = utcToZonedDateTime(startedAt, timezone).date;
  if (localDate !== startedAtLocalDate) {
    return {
      valid: false,
      error: "The date does not match the start time in your timezone.",
    };
  }
  return { valid: true };
}

/**
 * Check if a time range overlaps with an existing session on the same date.
 */
export function checkTimeRangeOverlap(
  newStart: Date,
  newEnd: Date,
  existingSessions: Array<{ started_at: string; completed_at: string }>
): ValidationResult {
  for (const existing of existingSessions) {
    const existingStart = new Date(existing.started_at);
    const existingEnd = new Date(existing.completed_at);
    
    // Check for overlap: [newStart, newEnd) overlaps [existingStart, existingEnd)
    // Overlap if: newStart < existingEnd AND newEnd > existingStart
    if (newStart < existingEnd && newEnd > existingStart) {
      return {
        valid: false,
        error: "This time overlaps with another session on the same date.",
      };
    }
  }
  return { valid: true };
}
