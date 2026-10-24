/**
 * Shared by scripts/gen-m3-baseline.ts and scripts/test-m3-wrist-lowerback-contraindications.ts
 * so the baseline and the test can never drift: same profiles, same catalogue
 * parsing, same swap path as src/app/session/actions.ts (pattern pool,
 * in-session exclusion, isEligible, limit 5, score scoreFn, hashed tie-break).
 */
import { generateProgram, isEligible, score, hashString, type CandidateExercise, type GeneratorInput } from "@/lib/program/generate";
import { rankAlternatives, buildPatternList } from "@/lib/program/alternatives";

export type M3Profile = Omit<GeneratorInput, "catalogue">;
export type M3Slot = { slug: string; sets: number; reps: string; swaps: string[] };
export type M3Day = { dayType: string; slots: M3Slot[] };

/** Accepts every catalogue row, including the 14 with mechanic: null. */
export function isCandidateExercise(e: unknown): e is CandidateExercise {
  if (typeof e !== "object" || e === null) return false;
  if (!("id" in e && typeof e.id === "string")) return false;
  if (!("slug" in e && typeof e.slug === "string")) return false;
  if (!("movement_pattern" in e && typeof e.movement_pattern === "string")) return false;
  if (!("mechanic" in e && (e.mechanic === null || typeof e.mechanic === "string"))) return false;
  if (!("contraindicated_regions" in e && Array.isArray(e.contraindicated_regions))) return false;
  if (!("equipment_ids" in e && Array.isArray(e.equipment_ids))) return false;
  if (!("tracks" in e && Array.isArray(e.tracks))) return false;
  return true;
}

export function parseCatalogue(raw: unknown): CandidateExercise[] {
  if (!Array.isArray(raw)) throw new Error("catalogue is not an array");
  const rows = raw.filter(isCandidateExercise);
  if (rows.length !== raw.length) throw new Error(`catalogue: ${raw.length - rows.length} rows failed the guard`);
  return rows;
}

/** Mirrors src/app/session/actions.ts:664-716. */
export function realSwaps(cat: CandidateExercise[], cur: CandidateExercise, input: GeneratorInput, inSession: Set<string>, seed: string): string[] {
  const inj = input.currentInjuryRegions;
  const patterns = buildPatternList(cur.movement_pattern, inj.includes("knee"));
  const eligible = cat
    .filter((e) => patterns.includes(e.movement_pattern))
    .filter((e) => !inSession.has(e.id))
    .filter((e) => isEligible(e, { ...input, catalogue: [] }));
  const wantCompound = cur.mechanic !== "isolation";
  return rankAlternatives(cur, eligible, {
    level: input.level,
    availableEquipment: input.hasAllEquipment ? null : new Set(input.equipmentIds),
    injuryRegions: inj,
    limit: 5,
    scoreFn: (e) => score(e, wantCompound, input.level, input.primaryTrack),
    tieBreakFn: (s) => hashString(`${seed}:${s}`),
  }).map((a) => a.slug);
}

/** Ordered plan (slug, sets, reps) plus the real swap list for every slot. */
export function snapshotPlan(profile: M3Profile, cat: CandidateExercise[]): M3Day[] {
  const input: GeneratorInput = { ...profile, catalogue: cat };
  const byId = new Map(cat.map((c) => [c.id, c]));
  return generateProgram(input).days.map((d, di) => {
    const inSession = new Set(d.exercises.map((x) => x.exerciseId));
    return {
      dayType: d.dayType,
      slots: d.exercises.map((x, xi) => {
        const ex = byId.get(x.exerciseId);
        if (!ex) throw new Error(`unknown exercise ${x.exerciseId}`);
        return { slug: ex.slug, sets: x.targetSets, reps: `${x.targetRepsMin}-${x.targetRepsMax}`, swaps: realSwaps(cat, ex, input, inSession, `${profile.userId}:d${di}:s${xi}`) };
      }),
    };
  });
}

const base = { blockNumber: 1, yogaDaysPerWeek: 0, age: 32, bmi: 24, currentInjuryRegions: [] };
/** No-injury baseline profiles: both tracks, 2-6 days, 30-75 min, real equipment ids from the seed. */
export const M3_NO_INJURY_PROFILES: M3Profile[] = [
  { ...base, userId: "bw-2d-30m-beginner", goal: "fat_loss", level: "beginner", primaryTrack: "bodyweight", daysPerWeek: 2, hasAllEquipment: false, equipmentIds: ["bodyweight", "yoga_mat"], preferredSessionMinutes: 30 },
  { ...base, userId: "bw-3d-45m-intermediate", goal: "strength", level: "intermediate", primaryTrack: "bodyweight", daysPerWeek: 3, hasAllEquipment: false, equipmentIds: ["bodyweight", "yoga_mat", "dip_bars", "resistance_band"], preferredSessionMinutes: 45 },
  { ...base, userId: "bw-4d-60m-expert", goal: "muscle_gain", level: "expert", primaryTrack: "bodyweight", daysPerWeek: 4, hasAllEquipment: false, equipmentIds: ["bodyweight", "yoga_mat", "dip_bars", "dumbbell", "resistance_band", "pull_up_bar"], preferredSessionMinutes: 60 },
  { ...base, userId: "db-3d-45m-beginner", goal: "fat_loss", level: "beginner", primaryTrack: "weights", daysPerWeek: 3, hasAllEquipment: false, equipmentIds: ["bodyweight", "dumbbell", "flat_bench"], preferredSessionMinutes: 45 },
  { ...base, userId: "kb-3d-60m-intermediate", goal: "fat_loss", level: "intermediate", primaryTrack: "weights", daysPerWeek: 3, hasAllEquipment: false, equipmentIds: ["kettlebell"], preferredSessionMinutes: 60 },
  { ...base, userId: "bb-4d-60m-intermediate", goal: "muscle_gain", level: "intermediate", primaryTrack: "weights", daysPerWeek: 4, hasAllEquipment: false, equipmentIds: ["barbell", "squat_rack", "flat_bench", "weight_plate"], preferredSessionMinutes: 60 },
  { ...base, userId: "gym-5d-60m-expert", goal: "muscle_gain", level: "expert", primaryTrack: "weights", daysPerWeek: 5, hasAllEquipment: true, equipmentIds: [], preferredSessionMinutes: 60 },
  { ...base, userId: "gym-6d-75m-expert", goal: "strength", level: "expert", primaryTrack: "weights", daysPerWeek: 6, hasAllEquipment: true, equipmentIds: [], preferredSessionMinutes: 75 },
];

/** Empty-swap regression grid (see /workspace/diag112.md): 7 setups x 3 levels x 4 goals x 5 day counts x 4 lengths = 1,680 profiles. */
export const M3_GRID_SETUPS: Array<Pick<GeneratorInput, "primaryTrack" | "hasAllEquipment" | "equipmentIds">> = [
  { primaryTrack: "weights", hasAllEquipment: true, equipmentIds: [] },
  { primaryTrack: "bodyweight", hasAllEquipment: false, equipmentIds: ["bodyweight"] },
  { primaryTrack: "bodyweight", hasAllEquipment: false, equipmentIds: ["bodyweight", "yoga_mat", "pull_up_bar", "dip_bars", "resistance_band"] },
  { primaryTrack: "weights", hasAllEquipment: false, equipmentIds: ["bodyweight", "dumbbell", "flat_bench"] },
  { primaryTrack: "weights", hasAllEquipment: false, equipmentIds: ["kettlebell"] },
  { primaryTrack: "weights", hasAllEquipment: false, equipmentIds: ["barbell", "squat_rack", "flat_bench", "weight_plate"] },
  { primaryTrack: "weights", hasAllEquipment: false, equipmentIds: ["bodyweight", "barbell", "squat_rack", "flat_bench", "adjustable_bench", "dumbbell", "kettlebell", "pull_up_bar", "cable_machine", "resistance_band"] },
];

export function countEmptySwapLists(cat: CandidateExercise[], injuries: GeneratorInput["currentInjuryRegions"]): { slots: number; empty: number } {
  const levels: GeneratorInput["level"][] = ["beginner", "intermediate", "expert"];
  const goals: GeneratorInput["goal"][] = ["fat_loss", "muscle_gain", "strength", "general_fitness"];
  let slots = 0, empty = 0;
  for (const s of M3_GRID_SETUPS) for (const level of levels) for (const goal of goals) for (const daysPerWeek of [2, 3, 4, 5, 6]) for (const preferredSessionMinutes of [30, 45, 60, 75]) {
    const plan = snapshotPlan({ userId: "22222222-2222-2222-2222-222222222222", blockNumber: 1, goal, level, ...s, daysPerWeek, yogaDaysPerWeek: 0, age: 35, bmi: 24, currentInjuryRegions: injuries, preferredSessionMinutes }, cat);
    for (const d of plan) for (const slot of d.slots) { slots++; if (slot.swaps.length === 0) empty++; }
  }
  return { slots, empty };
}
