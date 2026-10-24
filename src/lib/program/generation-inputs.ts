/**
 * Single source of truth for building generation_inputs snapshot
 */

import type { Database } from "@/lib/database.types";
import { DEFAULT_SESSION_LENGTH } from "@/lib/onboarding/session-length";

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

export function buildCurrentGenerationInputs(
  profile: {
    goal: Goal | null;
    level: Level | null;
    primary_track: Track | null;
    days_per_week: number | null;
    yoga_days_per_week: number | null;
    preferred_session_minutes: number | null;
    has_all_equipment: boolean | null;
  },
  equipmentIds: string[],
  currentInjuryRegions: BodyRegion[],
): GenerationInputsSnapshot {
  return {
    goal: profile.goal!,
    level: profile.level!,
    primary_track: profile.primary_track!,
    days_per_week: profile.days_per_week!,
    yoga_days_per_week: profile.yoga_days_per_week ?? 0,
    preferred_session_minutes: profile.preferred_session_minutes ?? DEFAULT_SESSION_LENGTH,
    has_all_equipment: profile.has_all_equipment ?? false,
    equipment_ids: equipmentIds.slice().sort(),
    current_injury_regions: currentInjuryRegions.slice().sort(),
  };
}
