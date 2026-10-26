/**
 * Knee volume grid: Profile list shared by generator and test.
 * At least 3,000 NON-knee profiles to verify identity, plus a KNEE grid for reporting.
 */

import type { GeneratorInput, CandidateExercise } from "../src/lib/program/generate";
import type { Database } from "../src/lib/database.types";
import { buildInjuryFlags } from "../src/lib/program/injury-regions";

type BodyRegion = Database["public"]["Enums"]["body_region"];
type InjurySeverity = Database["public"]["Enums"]["injury_severity"];
type Goal = Database["public"]["Enums"]["fitness_goal"];
type Level = Database["public"]["Enums"]["fitness_level"];

export type ProfileSpec = {
  id: string;
  userId: string;
  blockNumber: number;
  goal: Goal;
  level: Level;
  daysPerWeek: number;
  sessionMinutes: number;
  hasAllEquipment: boolean;
  equipmentIds: string[];
  injuries: Array<{ body_region: BodyRegion; severity: InjurySeverity }>;
};

function makeUserId(id: string): string {
  return `knee-vol-${id}`;
}

// Non-knee injury grid: 3,000+ profiles
const nonKneeProfiles: ProfileSpec[] = [];

// Injury combinations (no knee)
const nonKneeInjuries: Array<{ label: string; injuries: Array<{ body_region: BodyRegion; severity: InjurySeverity }> }> = [
  { label: "none", injuries: [] },
  { label: "shoulder-current", injuries: [{ body_region: "shoulder", severity: "current" }] },
  { label: "shoulder-past", injuries: [{ body_region: "shoulder", severity: "past" }] },
  { label: "wrist-current", injuries: [{ body_region: "wrist", severity: "current" }] },
  { label: "lower_back-current", injuries: [{ body_region: "lower_back", severity: "current" }] },
  { label: "lower_back-past", injuries: [{ body_region: "lower_back", severity: "past" }] },
  { label: "hip-current", injuries: [{ body_region: "hip", severity: "current" }] },
  { label: "shoulder+lower_back-current", injuries: [
    { body_region: "shoulder", severity: "current" },
    { body_region: "lower_back", severity: "current" },
  ]},
];

// Equipment sets
const equipmentSets: Array<{ label: string; hasAll: boolean; ids: string[] }> = [
  { label: "all", hasAll: true, ids: [] },
  { label: "barbell-rack-bench", hasAll: false, ids: ["barbell", "squat_rack", "bench"] },
  { label: "dumbbell-bench", hasAll: false, ids: ["dumbbell", "bench"] },
  { label: "kettlebell", hasAll: false, ids: ["kettlebell"] },
  { label: "bodyweight", hasAll: false, ids: [] },
];

const levels: Level[] = ["beginner", "intermediate", "expert"];
const daysPerWeekOptions = [2, 3, 4, 5, 6];
const sessionMinutesOptions = [30, 45, 60, 75, 90];
const goals: Goal[] = ["muscle_gain", "fat_loss", "strength", "general_fitness"];

// Generate non-knee grid
let idCounter = 0;
for (const injurySpec of nonKneeInjuries) {
  for (const level of levels) {
    for (const days of daysPerWeekOptions) {
      for (const minutes of sessionMinutesOptions) {
        for (const eqSet of equipmentSets) {
          // Rotate through goals
          const goal = goals[idCounter % goals.length];
          const id = `nk-${injurySpec.label}-${level}-${days}d-${minutes}m-${eqSet.label}-${goal}`;
          nonKneeProfiles.push({
            id,
            userId: makeUserId(id),
            blockNumber: 1,
            goal,
            level,
            daysPerWeek: days,
            sessionMinutes: minutes,
            hasAllEquipment: eqSet.hasAll,
            equipmentIds: eqSet.ids,
            injuries: injurySpec.injuries,
          });
          idCounter++;
        }
      }
    }
  }
}

// Knee injury grid
const kneeProfiles: ProfileSpec[] = [];

const kneeInjuries: Array<{ label: string; injuries: Array<{ body_region: BodyRegion; severity: InjurySeverity }> }> = [
  { label: "past-knee", injuries: [{ body_region: "knee", severity: "past" }] },
  { label: "current-knee", injuries: [{ body_region: "knee", severity: "current" }] },
  { label: "past-knee+shoulder-current", injuries: [
    { body_region: "knee", severity: "past" },
    { body_region: "shoulder", severity: "current" },
  ]},
  { label: "current-knee+lower_back", injuries: [
    { body_region: "knee", severity: "current" },
    { body_region: "lower_back", severity: "current" },
  ]},
];

idCounter = 0;
for (const injurySpec of kneeInjuries) {
  for (const level of levels) {
    for (const days of daysPerWeekOptions) {
      for (const minutes of sessionMinutesOptions) {
        for (const eqSet of equipmentSets) {
          const goal = goals[idCounter % goals.length];
          const id = `k-${injurySpec.label}-${level}-${days}d-${minutes}m-${eqSet.label}-${goal}`;
          kneeProfiles.push({
            id,
            userId: makeUserId(id),
            blockNumber: 1,
            goal,
            level,
            daysPerWeek: days,
            sessionMinutes: minutes,
            hasAllEquipment: eqSet.hasAll,
            equipmentIds: eqSet.ids,
            injuries: injurySpec.injuries,
          });
          idCounter++;
        }
      }
    }
  }
}

export const NON_KNEE_PROFILES = nonKneeProfiles;
export const KNEE_PROFILES = kneeProfiles;
export const ALL_PROFILES = [...nonKneeProfiles, ...kneeProfiles];

export function makeGeneratorInput(
  spec: ProfileSpec,
  catalogue: CandidateExercise[]
): GeneratorInput {
  const flags = buildInjuryFlags(spec.injuries);
  return {
    userId: spec.userId,
    blockNumber: spec.blockNumber,
    goal: spec.goal,
    level: spec.level,
    primaryTrack: "weights",
    daysPerWeek: spec.daysPerWeek,
    yogaDaysPerWeek: 0,
    age: 36,
    bmi: 78 / (1.76 * 1.76),
    hasAllEquipment: spec.hasAllEquipment,
    equipmentIds: spec.equipmentIds,
    currentInjuryRegions: flags.currentInjuryRegions,
    anyKneeInjury: flags.anyKneeInjury,
    preferredSessionMinutes: spec.sessionMinutes,
    catalogue,
  };
}
