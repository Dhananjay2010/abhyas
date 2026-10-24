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
 * Reset is required when primary_track changes (e.g., barbell → kettlebell).
 * 
 * Other profile changes (goal, level, days_per_week, age, weight) do NOT trigger a reset.
 */
export function shouldResetProgressionTargets(
  patch: ProfilePatch,
  current: CurrentProfile | null
): boolean {
  if (!current) return false;

  return (
    patch.primary_track !== undefined && patch.primary_track !== current.primary_track
  );
}
