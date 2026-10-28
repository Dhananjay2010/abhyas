/**
 * Apply knee injury cleanup to program days in Today loader.
 * 
 * W5 call-site mutant: Replace this call with identity function.
 * This is a pure function extracted from page.tsx for testability.
 */

import type { Database } from "@/lib/database.types";
import type { CandidateExercise, GeneratorInput } from "@/lib/program/generate";
import { toCandidateExercises } from "@/lib/program/candidate-exercise-guard";
import { buildCleanupGeneratorInput } from "@/lib/program/apply-banned-cleanup";

type PartialExerciseRow = Pick<
  Database["public"]["Tables"]["exercises"]["Row"],
  | "id"
  | "slug"
  | "name"
  | "movement_pattern"
  | "mechanic"
  | "metric"
  | "primary_muscles"
  | "equipment_ids"
  | "level_min"
  | "contraindicated_regions"
  | "impact"
  | "spinal_load"
  | "tracks"
  | "default_rest_seconds"
  | "category"
>;

type ProgramDay = {
  id: string;
  day_index: number;
  day_type: Database["public"]["Enums"]["day_type"];
  focus: string | null;
  label: string | null;
  program_day_exercises: {
    id: string;
    exercise_id: string;
    order_index: number;
    target_sets: number;
    target_reps_min: number;
    target_reps_max: number;
    rest_seconds: number;
    exercises: {
      name: string;
      cue: string | null;
      movement_pattern: Database["public"]["Enums"]["movement_pattern"];
      metric: "reps" | "seconds";
    };
  }[];
};

export type LoaderCleanupInput = {
  days: ProgramDay[] | null;
  injuries: Array<{ body_region: Database["public"]["Enums"]["body_region"]; severity: "current" | "past" }> | null;
  profile: {
    goal: Database["public"]["Enums"]["fitness_goal"] | null;
    level: Database["public"]["Enums"]["fitness_level"] | null;
    primary_track: Database["public"]["Enums"]["track_type"] | null;
    days_per_week: number | null;
    yoga_days_per_week: number | null;
    has_all_equipment: boolean;
  };
  catalogueRows: PartialExerciseRow[] | null;
  equipmentIds: string[];
  userId: string;
  applyDayCleanup: <T extends ProgramDay>(day: T, catalogue: CandidateExercise[], generatorInput: GeneratorInput, cleanupResults: { changed: boolean }[]) => T;
};

export function applyLoaderCleanup(
  input: LoaderCleanupInput,
  cleanupResults: { changed: boolean }[]
): ProgramDay[] | null {
  const { days, injuries, profile, catalogueRows, equipmentIds, userId, applyDayCleanup } = input;
  
  if (!days) return null;
  
  const hasKneeInjury = injuries?.some(inj => inj.body_region === "knee");
  if (!hasKneeInjury || !catalogueRows) {
    return days;
  }
  
  const catalogue = toCandidateExercises(catalogueRows);
  
  if (!profile.goal || !profile.level || !profile.primary_track || 
      profile.days_per_week === null || profile.yoga_days_per_week === null) {
    return days;
  }
  
  const generatorInput = buildCleanupGeneratorInput(
    {
      goal: profile.goal,
      level: profile.level,
      primary_track: profile.primary_track,
      days_per_week: profile.days_per_week,
      yoga_days_per_week: profile.yoga_days_per_week,
      has_all_equipment: profile.has_all_equipment,
    },
    injuries || [],
    equipmentIds,
    userId,
    catalogue
  );
  
  if (!generatorInput) {
    return days;
  }
  
  return days.map(day => applyDayCleanup(day, catalogue, generatorInput, cleanupResults));
}
