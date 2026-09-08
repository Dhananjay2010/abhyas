/**
 * Exercises the block generator against the real catalogue.
 *
 * The generator is a pure function, so we feed it a catalogue exported from the
 * live database (scripts/export-catalogue) rather than mocking exercises. What
 * is asserted here is the part that can hurt someone: that safety filters
 * actually remove what they claim to.
 *
 *   npm run test:generator
 */
import { readFileSync } from "node:fs";
import {
  generateProgram,
  type CandidateExercise,
  type GeneratorInput,
} from "../src/lib/program/generate";

// Defaults to the committed fixture so the suite runs offline; refresh it with
// scripts/export-catalogue.sh after changing the exercise seed.
const fixture = process.argv[2] ?? "scripts/fixtures/catalogue.json";
const catalogue = JSON.parse(readFileSync(fixture, "utf8")) as CandidateExercise[];
const byId = new Map(catalogue.map((e) => [e.id, e]));

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function base(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    userId: "11111111-1111-1111-1111-111111111111",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],
    catalogue,
    ...overrides,
  };
}

function allPicked(input: GeneratorInput) {
  const plan = generateProgram(input);
  const picked = plan.days.flatMap((d) => d.exercises.map((e) => byId.get(e.exerciseId)!));
  return { plan, picked };
}

console.log("\n1. Baseline: gym, 4 days, muscle gain");
{
  const { plan, picked } = allPicked(base());
  const training = plan.days.filter((d) => d.dayType === "weights");
  check("4 training days", training.length === 4, `got ${training.length}`);
  check("3 rest days", plan.days.filter((d) => d.dayType === "rest").length === 3);
  check("every training day has exercises", training.every((d) => d.exercises.length > 0));
  check("no exercise repeats in the block", new Set(picked.map((e) => e.id)).size === picked.length);
  check("upper/lower split", plan.splitType === "upper_lower", plan.splitType);
  const reps = plan.days.flatMap((d) => d.exercises).every((e) => e.targetRepsMin >= 8);
  check("muscle-gain rep range applied", reps);
}

console.log("\n2. Knee injury must remove every knee-loading exercise");
{
  const { picked } = allPicked(base({ currentInjuryRegions: ["knee"] }));
  const bad = picked.filter((e) => e.contraindicated_regions.includes("knee"));
  check("no knee-contraindicated exercise", bad.length === 0, bad.map((b) => b.name).join(", "));
}

console.log("\n3. Age 55 must cap high spinal load");
{
  const { picked } = allPicked(base({ age: 55 }));
  const bad = picked.filter((e) => e.spinal_load === "high");
  check("no high spinal load", bad.length === 0, bad.map((b) => b.name).join(", "));
}

console.log("\n4. BMI 32 must remove high-impact work");
{
  const { picked } = allPicked(base({ bmi: 32 }));
  const bad = picked.filter((e) => e.impact === "high");
  check("no high-impact exercise", bad.length === 0, bad.map((b) => b.name).join(", "));
}

console.log("\n5. Bodyweight at home, no equipment at all");
{
  const { plan, picked } = allPicked(
    base({ primaryTrack: "bodyweight", hasAllEquipment: false, equipmentIds: [], daysPerWeek: 3 }),
  );
  check("nothing needs equipment", picked.every((e) => e.equipment_ids.length === 0),
    picked.filter((e) => e.equipment_ids.length).map((e) => e.name).join(", "));
  check("all bodyweight-track", picked.every((e) => e.tracks.includes("bodyweight")));
  check("still produced a plan", picked.length > 0, `${picked.length} exercises`);
  check("full body split", plan.splitType === "full_body", plan.splitType);
  check("day type is bodyweight", plan.days.some((d) => d.dayType === "bodyweight"));
}

console.log("\n6. Beginner must never get advanced movements");
{
  const { picked } = allPicked(base({ level: "beginner" }));
  const bad = picked.filter((e) => e.level_min !== "beginner");
  check("only beginner-level exercises", bad.length === 0, bad.map((b) => b.name).join(", "));
}

console.log("\n7. Limited home equipment (dumbbells + bench only)");
{
  const { picked } = allPicked(
    base({ hasAllEquipment: false, equipmentIds: ["dumbbell", "flat_bench"] }),
  );
  const available = new Set(["dumbbell", "flat_bench"]);
  const bad = picked.filter((e) => !e.equipment_ids.every((x) => available.has(x)));
  check("nothing outside the equipment list", bad.length === 0,
    bad.map((b) => `${b.name}[${b.equipment_ids}]`).join(", "));
  check("still produced a plan", picked.length > 0, `${picked.length} exercises`);
}

console.log("\n8. Yoga days are placed and kept off leg days");
{
  const { plan } = allPicked(base({ daysPerWeek: 5, yogaDaysPerWeek: 2 }));
  const yoga = plan.days.filter((d) => d.dayType === "yoga");
  const training = plan.days.filter((d) => d.dayType === "weights" || d.dayType === "bodyweight");
  check("2 yoga days", yoga.length === 2, `got ${yoga.length}`);
  check("3 training days", training.length === 3, `got ${training.length}`);

  const active = plan.days.filter((d) => d.dayType !== "rest");
  let adjacentToLegs = false;
  active.forEach((d, i) => {
    if (d.dayType !== "yoga") return;
    for (const n of [active[i - 1], active[i + 1]]) {
      if (n && (n.focus === "legs" || n.focus === "lower")) adjacentToLegs = true;
    }
  });
  check("no yoga day next to a leg day", !adjacentToLegs);
}

console.log("\n9. Determinism and block-to-block variety");
{
  const a = generateProgram(base());
  const b = generateProgram(base());
  const slugsOf = (p: ReturnType<typeof generateProgram>) =>
    p.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)).join(",");
  check("same input gives same plan", slugsOf(a) === slugsOf(b));

  const block2 = generateProgram(base({ blockNumber: 2 }));
  const s1 = new Set(a.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
  const s2 = new Set(block2.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
  const overlap = [...s1].filter((x) => s2.has(x)).length;
  const pct = Math.round((overlap / Math.max(s1.size, 1)) * 100);
  check("block 2 differs from block 1", overlap < s1.size, `${pct}% carried over`);
}

console.log("\n10. Everything at once: 52yo, BMI 31, shoulder + lower back injuries");
{
  const { plan, picked } = allPicked(
    base({ age: 52, bmi: 31, currentInjuryRegions: ["shoulder", "lower_back"], level: "beginner" }),
  );
  check("no shoulder-loading", !picked.some((e) => e.contraindicated_regions.includes("shoulder")));
  check("no lower-back loading", !picked.some((e) => e.contraindicated_regions.includes("lower_back")));
  check("no high spinal load", !picked.some((e) => e.spinal_load === "high"));
  check("no high impact", !picked.some((e) => e.impact === "high"));
  check("still produced a usable plan", picked.length >= 6, `${picked.length} exercises`);
  console.log(
    "       sample:",
    plan.days.filter((d) => d.exercises.length).slice(0, 2)
      .map((d) => `${d.label}: ${d.exercises.map((e) => e.name).join(" / ")}`).join("  |  "),
  );
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
