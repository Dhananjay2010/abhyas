/**
 * Plan staleness detection.
 *
 * A plan is "stale" when the user's current profile settings differ from the
 * snapshot stored at generation time. This prompts them to rebuild the block
 * so the exercises match their equipment, injuries and chosen difficulty.
 */

import type { Database } from "@/lib/database.types";

type Goal = Database["public"]["Enums"]["fitness_goal"];
type Level = Database["public"]["Enums"]["fitness_level"];
type Track = Database["public"]["Enums"]["track_type"];
type BodyRegion = Database["public"]["Enums"]["body_region"];

export type GenerationInputsSnapshot = {
  goal: Goal;
  level: Level;
  primary_track: Track;
  days_per_week: number;
  yoga_days_per_week: number;
  preferred_session_minutes: number;
  has_all_equipment: boolean;
  equipment_ids: string[];
  current_injury_regions: BodyRegion[];
};

export type ProfileAnswers = {
  goal: Goal | null;
  level: Level | null;
  primary_track: Track | null;
  days_per_week: number | null;
  yoga_days_per_week: number;
  preferred_session_minutes: number;
  has_all_equipment: boolean;
  equipment_ids: string[];
  current_injury_regions: BodyRegion[];
};

export type ActiveBlock = {
  generation_inputs: GenerationInputsSnapshot | null;
  days_per_week: number;
  yoga_days_per_week_from_days?: number;
};

export type StalenessResult = {
  stale: boolean;
  reasons: string[];
};

/**
 * Check if the active block matches the user's current profile settings.
 *
 * Returns `{ stale: true, reasons: [...] }` when a rebuild is needed.
 * Falls back to comparing the block's own fields when generation_inputs is missing.
 */
export function isPlanStale(
  profile: ProfileAnswers,
  block: ActiveBlock | null,
): StalenessResult {
  if (!block) {
    return { stale: false, reasons: [] };
  }

  const reasons: string[] = [];
  const inputs = block.generation_inputs;

  if (!inputs) {
    // Fallback for plans created before generation_inputs was added:
    // Compare the fields we can derive from the block itself.
    if (
      profile.days_per_week !== null &&
      profile.days_per_week !== block.days_per_week
    ) {
      reasons.push("days per week changed");
    }

    // Yoga days: count yoga program_days as a proxy (not implemented here —
    // would need the caller to pass it in, but the Settings page doesn't
    // fetch program_days, so this is left as a known gap for old plans).

    // Session length, equipment and injuries cannot be derived from the block,
    // so old plans can't detect those changes.
    return { stale: reasons.length > 0, reasons };
  }

  // With a snapshot, we can compare everything:
  if (profile.goal !== null && profile.goal !== inputs.goal) {
    reasons.push("goal changed");
  }

  if (profile.level !== null && profile.level !== inputs.level) {
    reasons.push("level changed");
  }

  if (
    profile.primary_track !== null &&
    profile.primary_track !== inputs.primary_track
  ) {
    reasons.push("training type changed");
  }

  if (
    profile.days_per_week !== null &&
    profile.days_per_week !== inputs.days_per_week
  ) {
    reasons.push("days per week changed");
  }

  if (profile.yoga_days_per_week !== inputs.yoga_days_per_week) {
    reasons.push("yoga days changed");
  }

  if (profile.preferred_session_minutes !== inputs.preferred_session_minutes) {
    reasons.push("session length changed");
  }

  if (profile.has_all_equipment !== inputs.has_all_equipment) {
    reasons.push("equipment access changed");
  }

  // Equipment IDs: compare sorted arrays
  const profileEqSorted = profile.equipment_ids.slice().sort();
  const inputsEqSorted = inputs.equipment_ids.slice().sort();
  if (
    profileEqSorted.length !== inputsEqSorted.length ||
    profileEqSorted.some((id, i) => id !== inputsEqSorted[i])
  ) {
    reasons.push("equipment selection changed");
  }

  // Injury regions: compare sorted arrays
  const profileInjSorted = profile.current_injury_regions.slice().sort();
  const inputsInjSorted = inputs.current_injury_regions.slice().sort();
  if (
    profileInjSorted.length !== inputsInjSorted.length ||
    profileInjSorted.some((r, i) => r !== inputsInjSorted[i])
  ) {
    reasons.push("injuries changed");
  }

  return { stale: reasons.length > 0, reasons };
}
