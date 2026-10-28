/**
 * Build GeneratorInput for banned exercise cleanup.
 * Shared builder used by start-session, ensure-session, Today page and cleanBannedPlannedExercises.
 */

import type { Database } from "@/lib/database.types";
import { replaceBannedInPlanned, type PlannedExercise, type ReplacementResult } from "@/lib/program/replace-banned-in-planned";
import type { CandidateExercise, GeneratorInput } from "@/lib/program/generate";
import { buildInjuryFlags } from "@/lib/program/injury-regions";

export function buildCleanupGeneratorInput(
  profile: {
    goal: Database["public"]["Enums"]["fitness_goal"];
    level: Database["public"]["Enums"]["fitness_level"];
    primary_track: Database["public"]["Enums"]["track_type"];
    days_per_week: number;
    yoga_days_per_week: number;
    has_all_equipment: boolean;
  },
  injuries: Array<{ body_region: Database["public"]["Enums"]["body_region"]; severity: "current" | "past" }>,
  equipmentIds: string[],
  userId: string,
  catalogue: CandidateExercise[],
): GeneratorInput | null {
  const { currentInjuryRegions, anyKneeInjury } = buildInjuryFlags(injuries);
  
  if (!anyKneeInjury) {
    return null;
  }
  
  return {
    userId,
    blockNumber: 1,
    goal: profile.goal,
    level: profile.level,
    primaryTrack: profile.primary_track,
    daysPerWeek: profile.days_per_week,
    yogaDaysPerWeek: profile.yoga_days_per_week,
    age: null,
    bmi: null,
    hasAllEquipment: profile.has_all_equipment,
    equipmentIds,
    currentInjuryRegions,
    anyKneeInjury,
    catalogue,
  };
}

export function applyBannedCleanup(
  planned: PlannedExercise[],
  catalogue: CandidateExercise[],
  profile: {
    goal: Database["public"]["Enums"]["fitness_goal"];
    level: Database["public"]["Enums"]["fitness_level"];
    primary_track: Database["public"]["Enums"]["track_type"];
    days_per_week: number;
    yoga_days_per_week: number;
    has_all_equipment: boolean;
  },
  injuries: Array<{ body_region: Database["public"]["Enums"]["body_region"]; severity: "current" | "past" }>,
  userId: string,
  equipmentIds: string[],
): ReplacementResult {
  const generatorInput = buildCleanupGeneratorInput(profile, injuries, equipmentIds, userId, catalogue);
  
  if (!generatorInput) {
    return { rows: planned, changed: false };
  }
  
  return replaceBannedInPlanned(planned, catalogue, generatorInput);
}
