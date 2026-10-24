/**
 * Pure decision logic for when to reset progression targets
 */

export type ProfilePatch = {
  goal?: string | null;
  level?: string | null;
  days_per_week?: number | null;
  primary_track?: string | null;
  [key: string]: unknown;
};

export type CurrentProfile = {
  goal: string | null;
  level: string | null;
  days_per_week: number | null;
  primary_track: string | null;
};

/**
 * Determines if a profile update requires resetting progression targets.
 * 
 * Reset is required when any of these fields change:
 * - goal (e.g., hypertrophy → strength)
 * - level (e.g., beginner → intermediate)
 * - days_per_week (e.g., 3 → 4)
 * - primary_track (e.g., barbell → kettlebell)
 * 
 * Other profile changes (age, weight, etc.) do NOT trigger a reset.
 */
export function shouldResetProgressionTargets(
  patch: ProfilePatch,
  current: CurrentProfile | null
): boolean {
  if (!current) return false;

  return (
    (patch.goal !== undefined && patch.goal !== current.goal) ||
    (patch.level !== undefined && patch.level !== current.level) ||
    (patch.days_per_week !== undefined && patch.days_per_week !== current.days_per_week) ||
    (patch.primary_track !== undefined && patch.primary_track !== current.primary_track)
  );
}
