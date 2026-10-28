#!/usr/bin/env npx tsx
/**
 * M11: Force-add current-knee filter removed
 *
 * Mutant: `if (false && isExcludedForCurrentKneeOnly(e)) return false;`
 *         at generate.ts in the force-add lower-body path (runs only when a
 *         lower day has nonCoreLowerCount < 2).
 *
 * Part 1 (synthetic catalogue, restored from e41cff33): on the real catalogue
 * every CURRENT_KNEE_ONLY slug (KB jerks, KB push presses, kettlebell-thruster)
 * is tagged front_delts/side_delts only, so the force-add's lower-body filter
 * drops them before the ban check: the ban check is unreachable there (M11 is
 * equivalent on today's catalogue). This fixture relabels kettlebell-thruster to
 * leg-driven (quads/glutes, which the movement really is) and removes every
 * other non-core lower-body exercise, so the thruster is the ONLY force-add
 * candidate and only the ban check keeps it out. (APP decision: M11 is the
 * synthetic test.)
 *
 * Part 2 (real catalogue, from 3268d1d0): a limited-equipment current-knee
 * plan never contains a thruster.
 */
import { readFileSync } from "fs";
import { generateProgram, isEligible, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { isExcludedForCurrentKneeOnly } from "../src/lib/program/past-knee";
import { toCandidateExercises } from "../src/lib/program/candidate-exercise-guard";
import type { Database } from "../src/lib/database.types";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) console.log(`  ✓ ${name}`);
  else console.error(`  ✗ FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// ---------------------------------------------------------------- part 1
console.log("Part 1: synthetic catalogue, thruster is the only force-add candidate\n");

const LOWER = ["quads", "glutes", "hamstrings", "calves", "adductors", "abductors"];
// Same loading pattern used by main's scripts/test-generator.ts.
const real: CandidateExercise[] = JSON.parse(readFileSync("scripts/fixtures/catalogue.json", "utf8"));
const isLowerNonCore = (e: CandidateExercise) =>
  e.movement_pattern !== "core" && e.primary_muscles.some(m => LOWER.includes(m));

const original = real.find(e => e.slug === "kettlebell-thruster");
if (!original) throw new Error("kettlebell-thruster missing from catalogue fixture");
const legDrivenThruster: CandidateExercise = { ...original, primary_muscles: ["quads", "glutes", "front_delts"] };
const catalogue: CandidateExercise[] = [
  ...real.filter(e => e.slug !== "kettlebell-thruster" && !isLowerNonCore(e)),
  legDrivenThruster,
];

const input: GeneratorInput = {
  userId: "m11-synthetic", blockNumber: 1, goal: "muscle_gain", level: "intermediate", primaryTrack: "weights",
  daysPerWeek: 3, yogaDaysPerWeek: 0, age: 30, bmi: 23, hasAllEquipment: true, equipmentIds: [],
  currentInjuryRegions: ["knee"], anyKneeInjury: true, preferredSessionMinutes: 60, catalogue,
};

// Non-vacuity: the thruster passes every force-add filter except the ban check.
check("fixture: thruster is banned for current knee", isExcludedForCurrentKneeOnly(legDrivenThruster));
check("fixture: thruster is lower-body, non-core", isLowerNonCore(legDrivenThruster));
check("fixture: thruster passes isEligible for this member", isEligible(legDrivenThruster, input));
check("fixture: thruster has no knee tag", !legDrivenThruster.contraindicated_regions.includes("knee"));
check("fixture: thruster is not squat/lunge pattern", legDrivenThruster.movement_pattern !== "squat" && legDrivenThruster.movement_pattern !== "lunge");
check("fixture: it is the only lower-body non-core exercise", catalogue.filter(isLowerNonCore).length === 1);

const program = generateProgram(input);
const placed = program.days.flatMap(d => d.exercises).filter(x => x.exerciseId === legDrivenThruster.id);
check("current-knee plan never contains the banned thruster via force-add", placed.length === 0, `placed ${placed.length} time(s)`);
check("plan is non-empty (generator ran)", program.days.flatMap(d => d.exercises).length > 0);
// The force-add path is reached: a weights day ends with fewer than 2 non-core lower picks.
const byId = new Map(catalogue.map(e => [e.id, e]));
const weightsDays = program.days.filter(d => d.dayType === "weights");
check(
  "force-add path reached (a weights day has < 2 non-core lower picks)",
  weightsDays.some(d => d.exercises.filter(x => { const e = byId.get(x.exerciseId); return e !== undefined && isLowerNonCore(e); }).length < 2),
  `weights days: ${weightsDays.length}`,
);

// ---------------------------------------------------------------- part 2
console.log("\nPart 2: real catalogue, limited equipment\n");

type ExerciseRow = Database["public"]["Tables"]["exercises"]["Row"];
const catalogueRows: ExerciseRow[] = JSON.parse(readFileSync("scripts/fixtures/catalogue.json", "utf-8"));
const fullCatalogue = toCandidateExercises(catalogueRows);
const thrusters = fullCatalogue.filter(e =>
  ["kettlebell-thruster", "dumbbell-thruster", "barbell-thruster"].includes(e.slug)
);
check("fixture: thrusters found in the real catalogue", thrusters.length > 0);

const result = generateProgram({
  userId: "u1", blockNumber: 1, goal: "muscle_gain", level: "beginner", primaryTrack: "weights",
  daysPerWeek: 4, yogaDaysPerWeek: 0, age: 25, bmi: 22, hasAllEquipment: false,
  equipmentIds: ["kettlebell", "dumbbell"],
  currentInjuryRegions: ["knee"], anyKneeInjury: true, catalogue: fullCatalogue,
});
check("generateProgram returned days", result.days.length > 0);
const thrusterIds = new Set(thrusters.map(t => t.id));
const foundThrusters = result.days.flatMap(d => d.exercises.map(e => e.exerciseId)).filter(id => thrusterIds.has(id));
check(
  "real-catalogue current-knee plan has no thrusters",
  foundThrusters.length === 0,
  foundThrusters.map(id => fullCatalogue.find(e => e.id === id)?.slug ?? id).join(", "),
);

console.log(failures === 0 ? "\n✓ PASS: force-add banned (synthetic + real) passed" : `\n✗ FAIL: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
