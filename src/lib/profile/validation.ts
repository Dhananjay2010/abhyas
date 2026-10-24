/**
 * Profile field validation and allow-listing for server actions.
 *
 * M5: Users must not be able to set arbitrary profile columns that bypass
 * onboarding flow (e.g. disclaimer_accepted_at, onboarding_completed_at) or
 * break the app (e.g. invalid timezone that crashes Intl).
 */

import type { Database } from "@/lib/database.types";
import { MIN_AGE_YEARS, ageOn } from "@/lib/onboarding/options";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

/**
 * Columns that can be set through saveProfileFields (onboarding).
 * This is the wider list; settings use a stricter subset.
 */
const ONBOARDING_ALLOWED_COLUMNS: ReadonlySet<keyof ProfileRow> = new Set([
  "display_name",
  "goal",
  "level",
  "primary_track",
  "days_per_week",
  "yoga_days_per_week",
  "preferred_session_minutes",
  "has_all_equipment",
  "units",
]);

/**
 * Columns that can be changed through updateProfileSettings (settings screen).
 * Narrower than onboarding: display_name and units are not in Settings.
 */
const SETTINGS_ALLOWED_COLUMNS: ReadonlySet<keyof ProfileRow> = new Set([
  "goal",
  "level",
  "primary_track",
  "days_per_week",
  "yoga_days_per_week",
  "preferred_session_minutes",
  "has_all_equipment",
]);

/**
 * Columns that are never writable by the client, even through an RPC.
 * They have business logic around them (age gate, disclaimer, timezone validation)
 * and must only be set through their dedicated actions.
 */
const NEVER_WRITABLE: ReadonlySet<keyof ProfileRow> = new Set([
  "id",
  "date_of_birth",
  "sex",
  "height_cm",
  "timezone",
  "disclaimer_accepted_at",
  "onboarding_completed_at",
  "avatar_url", // Set by the auth trigger from OAuth
  "created_at",
  "updated_at",
]);

export type ValidationResult = { ok: true; data: ProfileUpdate } | { ok: false; error: string };

/**
 * Validate and allow-list fields for onboarding actions.
 * Returns only the columns that are safe to write.
 */
export function validateOnboardingFields(fields: ProfileUpdate): ValidationResult {
  const allowed: ProfileUpdate = {};
  const rejected: string[] = [];

  for (const [key, value] of Object.entries(fields)) {
    const k = key as keyof ProfileRow;
    if (NEVER_WRITABLE.has(k)) {
      rejected.push(key);
    } else if (ONBOARDING_ALLOWED_COLUMNS.has(k)) {
      allowed[k] = value as never;
    } else {
      // Not in the allow-list; silently ignore rather than error
      rejected.push(key);
    }
  }

  if (rejected.length > 0) {
    return {
      ok: false,
      error: `These fields cannot be set this way: ${rejected.join(", ")}`,
    };
  }

  // Validate specific fields
  if (allowed.days_per_week != null) {
    if (!Number.isInteger(allowed.days_per_week) || allowed.days_per_week < 3 || allowed.days_per_week > 6) {
      return { ok: false, error: "Days per week must be between 3 and 6." };
    }
  }

  if (allowed.yoga_days_per_week != null && allowed.days_per_week != null) {
    if (allowed.yoga_days_per_week > allowed.days_per_week - 1) {
      return { ok: false, error: "At least one day a week has to be training." };
    }
  }

  if (allowed.preferred_session_minutes != null) {
    if (!Number.isInteger(allowed.preferred_session_minutes) || allowed.preferred_session_minutes < 15 || allowed.preferred_session_minutes > 120) {
      return { ok: false, error: "Session length must be between 15 and 120 minutes." };
    }
  }

  return { ok: true, data: allowed };
}

/**
 * Validate and allow-list fields for the Settings screen.
 * Stricter than onboarding: display_name and units are not editable in Settings.
 */
export function validateSettingsFields(fields: ProfileUpdate): ValidationResult {
  const allowed: ProfileUpdate = {};
  const rejected: string[] = [];

  for (const [key, value] of Object.entries(fields)) {
    const k = key as keyof ProfileRow;
    if (NEVER_WRITABLE.has(k)) {
      rejected.push(key);
    } else if (SETTINGS_ALLOWED_COLUMNS.has(k)) {
      allowed[k] = value as never;
    } else {
      rejected.push(key);
    }
  }

  if (rejected.length > 0) {
    return {
      ok: false,
      error: `These fields cannot be changed in Settings: ${rejected.join(", ")}`,
    };
  }

  // Same validations as onboarding for the fields that overlap
  if (allowed.days_per_week != null) {
    if (!Number.isInteger(allowed.days_per_week) || allowed.days_per_week < 3 || allowed.days_per_week > 6) {
      return { ok: false, error: "Days per week must be between 3 and 6." };
    }
  }

  if (allowed.yoga_days_per_week != null && allowed.days_per_week != null) {
    if (allowed.yoga_days_per_week > allowed.days_per_week - 1) {
      return { ok: false, error: "At least one day a week has to be training." };
    }
  }

  if (allowed.preferred_session_minutes != null) {
    if (!Number.isInteger(allowed.preferred_session_minutes) || allowed.preferred_session_minutes < 15 || allowed.preferred_session_minutes > 120) {
      return { ok: false, error: "Session length must be between 15 and 120 minutes." };
    }
  }

  return { ok: true, data: allowed };
}

/**
 * Validate timezone string is a valid IANA timezone.
 * Returns the normalized timezone or an error.
 */
export function validateTimezone(tz: string): { ok: true; timezone: string } | { ok: false; error: string } {
  try {
    // Test if the timezone is valid by trying to format a date with it
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return { ok: true, timezone: tz };
  } catch {
    return { ok: false, error: `"${tz}" is not a valid timezone.` };
  }
}

/**
 * Validate date of birth: must be at least MIN_AGE_YEARS old, no more than 100.
 * Returns normalized yyyy-mm-dd string or an error.
 */
export function validateDateOfBirth(
  dob: string,
  timezone: string,
): { ok: true; date: string } | { ok: false; error: string } {
  // Compute age in the user's timezone, not UTC
  const age = ageOn(dob, new Date(), timezone);
  
  if (Number.isNaN(age)) {
    return { ok: false, error: "That date does not look right." };
  }
  if (age < MIN_AGE_YEARS) {
    return { ok: false, error: `You need to be at least ${MIN_AGE_YEARS} to use Abhyas.` };
  }
  if (age > 100) {
    return { ok: false, error: "Please check your date of birth." };
  }

  // Return normalized format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    return { ok: false, error: "Date must be in yyyy-mm-dd format." };
  }

  return { ok: true, date: dob };
}
