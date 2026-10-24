/**
 * Pure profile update logic extracted for testing.
 *
 * Extracted timezone and date_of_birth validation and update logic with injected dependencies,
 * making it testable without mocking Supabase.
 */

import { sanitizeTimezonePatch } from "@/lib/timezone-patch";
import { validateDob, getDobErrorMessage } from "@/lib/onboarding/dob";
import type { Database } from "@/lib/database.types";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
export type Result = { ok: true } | { ok: false; error: string };

export interface ProfileUpdateDeps {
  updateProfile: (patch: ProfileUpdate) => Promise<Result>;
  getTodayIso: () => string;
}

/**
 * Validate and update profile timezone and date_of_birth with injected dependencies.
 *
 * This is the core update logic separated from Supabase specifics.
 * Testable by injecting spy dependencies.
 *
 * Flow:
 * 1. If timezone is undefined, skip validation (preserves current value)
 * 2. Validate and canonicalize timezone
 * 3. If date_of_birth is explicitly set, validate age bounds
 * 4. On invalid: return error WITHOUT calling updateProfile
 * 5. On valid: call updateProfile with validated values
 */
export async function validateAndUpdateProfile(
  patch: ProfileUpdate,
  deps: ProfileUpdateDeps
): Promise<Result> {
  // Only validate when timezone is explicitly set (not undefined)
  // to avoid resetting to gym default
  if (patch.timezone !== undefined) {
    const sanitized = sanitizeTimezonePatch(patch.timezone);
    if (!sanitized.ok) {
      // Validation failed: return error WITHOUT calling updateProfile
      return { ok: false, error: sanitized.error };
    }
    // Replace raw input with canonical value
    patch.timezone = sanitized.timezone;
  }

  // Validate date_of_birth when explicitly set
  if (patch.date_of_birth !== undefined) {
    if (patch.date_of_birth === null) {
      // Allow clearing DOB (null)
      // No validation needed
    } else {
      const todayIso = deps.getTodayIso();
      const error = validateDob(patch.date_of_birth, todayIso);
      if (error) {
        const message = getDobErrorMessage(error);
        return { ok: false, error: message };
      }
    }
  }

  // Call the injected update function with the validated patch
  return await deps.updateProfile(patch);
}
