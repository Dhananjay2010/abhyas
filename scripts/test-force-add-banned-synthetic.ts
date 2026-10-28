/**
 * M11 killer (synthetic catalogue): the current-knee force-add of lower-body
 * work in generateProgram must never add a CURRENT_KNEE_ONLY banned exercise.
 *
 * On the real catalogue every CURRENT_KNEE_ONLY slug (KB jerks, KB push
 * presses, kettlebell-thruster) is tagged front_delts/side_delts only, so the
 * force-add's lower-body filter drops them before the ban check: the ban check
 * is unreachable there (M11 is equivalent on today's catalogue). This fixture
 * relabels kettlebell-thruster as leg-driven (quads/glutes, as the movement
 * really is) and removes every other non-core lower-body exercise, so the
 * thruster is the ONLY force-add candidate and only the ban check keeps it out.
 */
import { readFileSync } from "fs";
import { generateProgram, isEligible, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { isExcludedForCurrentKneeOnly } from "../src/lib/program/past-knee";

const LOWER = ["quads", "glutes", "hamstrings", "calves", "adductors", "abductors"];
// Same loading pattern as main's scripts/test-generator.ts.
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

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

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

console.log(failures === 0 ? "\n✓ force-add banned (synthetic) passed" : `\n✗ ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
