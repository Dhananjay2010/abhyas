#!/usr/bin/env tsx
/**
 * Test (QA2 L-2): a successful session never lowers the working weight.
 *
 * Product decision: on a top-of-range success the next step starts from
 * max(current working weight, heaviest set that met the rep target). So sets
 * of 60/60/60/65 kg step from 65 (not the 60 mode), and a success at a lighter
 * load than prescribed (220 lb against 105 kg) never becomes 100 kg. Every case
 * calls the real evaluateProgression.
 */

import { evaluateProgression, type Decision, type ExerciseMeta, type LoggedSet } from "@/lib/program/progression";
import type { WeightUnit } from "@/lib/session/equipment-grid";
import { lbToKg } from "@/lib/units";

let failures = 0;
function check(desc: string, pass: boolean, detail = ""): void {
  if (!pass) {
    console.log(`  ❌ FAIL ${desc}${detail ? ` -- ${detail}` : ""}`);
    failures++;
  } else {
    console.log(`  ✓ ${desc}`);
  }
}

const BENCH: ExerciseMeta = {
  mechanic: "compound",
  movementPattern: "horizontal_press",
  metric: "reps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};
const SQUAT: ExerciseMeta = { ...BENCH, movementPattern: "squat" };

function success(opts: {
  weights: number[];
  current: number | null;
  equipmentIds?: string[];
  unit?: WeightUnit | null;
  meta?: ExerciseMeta;
  feel?: "easy" | "right" | null;
}): Decision {
  const sets: LoggedSet[] = opts.weights.map((w) => ({ reps: 12, weightKg: w }));
  return evaluateProgression({
    sets,
    plannedSets: opts.weights.length,
    repsMin: 8,
    repsMax: 12,
    feel: opts.feel ?? "right",
    meta: opts.meta ?? BENCH,
    state: {
      currentWorkingWeightKg: opts.current,
      currentTargetReps: 12,
      consecutiveFailures: 0,
      bestWeightKg: null,
      bestReps: null,
      bestE1rm: null,
      totalSessions: 3,
      weightAtFailureStartKg: null,
    },
    isDeload: false,
    equipmentIds: "equipmentIds" in opts ? opts.equipmentIds : ["barbell"],
    unit: "unit" in opts ? opts.unit : "kg",
  });
}

console.log("\n=== QA2 L-2 repros ===\n");
{
  const d = success({ weights: [60, 60, 60, 65], current: 60 });
  check("60/60/60/65 (stored 60): steps from 65 to 67.5 kg", d.nextWorkingWeightKg === 67.5, `got ${d.nextWorkingWeightKg}`);
  check("  outcome progressed", d.outcome === "progressed", d.outcome);
}
{
  const lifted = Math.round(lbToKg(220) * 100) / 100; // 99.79 kg
  const d = success({ weights: [lifted, lifted, lifted, lifted], current: 105, unit: "lb" });
  check("Stored 105 kg, 4×12 at 220 lb: next is 107.5 kg, never 100", d.nextWorkingWeightKg === 107.5, `got ${d.nextWorkingWeightKg}`);
  check("  message says up to 237 lb", d.message === "All sets at the top of the range — up to 237 lb.", d.message);
}
{
  const d = success({ weights: [100, 100, 100, 100], current: 105 });
  check("Stored 105, 4×12 at 100 kg: next 107.5 (from 105, not 100)", d.nextWorkingWeightKg === 107.5, `got ${d.nextWorkingWeightKg}`);
}
{
  const d = success({ weights: [70, 70, 72.5, 72.5], current: 70 });
  check("70/70/72.5/72.5 (stored 70): steps from 72.5 to 75", d.nextWorkingWeightKg === 75, `got ${d.nextWorkingWeightKg}`);
}
{
  const d = success({ weights: [60, 60, 60, 65], current: null });
  check("No stored weight, 60/60/60/65: steps from 65 to 67.5", d.nextWorkingWeightKg === 67.5, `got ${d.nextWorkingWeightKg}`);
}
{
  const d = success({ weights: [100, 100, 100, 100], current: 100, meta: SQUAT });
  check("Squat 100 kg (stored 100): +5 to 105 (unchanged)", d.nextWorkingWeightKg === 105, `got ${d.nextWorkingWeightKg}`);
}
{
  const d = success({ weights: [10, 10, 10, 12.5], current: 10, equipmentIds: ["dumbbell"] });
  check("Dumbbell 10/10/10/12.5: steps from 12.5 to 15", d.nextWorkingWeightKg === 15, `got ${d.nextWorkingWeightKg}`);
}
{
  const d = success({ weights: [16, 16, 16, 20], current: 16, equipmentIds: ["kettlebell"] });
  check("Kettlebell 16/16/16/20: next bell above 20 (24)", d.nextWorkingWeightKg === 24, `got ${d.nextWorkingWeightKg}`);
}
{
  const d = success({ weights: [60, 60, 60, 65], current: 60, equipmentIds: undefined, unit: undefined });
  check("No equipment info, 60/60/60/65: steps from 65 to 67.5", d.nextWorkingWeightKg === 67.5, `got ${d.nextWorkingWeightKg}`);
}

console.log("\n=== Property: success never ends below max(stored, heaviest set) ===\n");
{
  let cases = 0;
  let bad = 0;
  const examples: string[] = [];
  for (const eq of [["barbell"], ["dumbbell"], ["cable_machine"], ["kettlebell"], undefined] as Array<string[] | undefined>) {
    for (let current = 20; current <= 140; current += 2.5) {
      for (const delta of [-12.5, -5, -2.5, -0.21, 0, 1.3, 2.5, 7.5]) {
        const top = Math.round((current + delta) * 100) / 100;
        if (top <= 0) continue;
        for (const feel of ["right", "easy", null] as const) {
          const d = success({ weights: [current, current, current, top], current, equipmentIds: eq, unit: "kg", feel });
          const floor = Math.max(current, top);
          cases++;
          if ((d.nextWorkingWeightKg ?? 0) < floor - 1e-9) {
            bad++;
            if (examples.length < 5) examples.push(`${eq?.[0] ?? "none"} stored ${current}, top ${top} -> ${d.nextWorkingWeightKg}`);
          }
        }
      }
    }
  }
  check(`${cases} success cases: none below max(stored, heaviest qualifying set)`, bad === 0, `${bad} bad, e.g. ${examples.join("; ")}`);
}

console.log();
if (failures > 0) {
  console.log(`❌ ${failures} check(s) failed`);
  process.exit(1);
}
console.log("All success-never-lowers checks passed.");
