#!/usr/bin/env tsx
/**
 * Test: barbell back-off and step-down never go below the empty bar.
 *
 * #120's progression could take a 20 kg barbell lift to 17.5 kg on a two-miss
 * back-off or a third-miss step-down, which can't be loaded. The floor is the
 * bar: 20 kg, or 45 lb (20.41 kg) for an imperial user. At the floor the lift
 * holds, the same way the lightest medicine ball does. A start below the bar
 * (old data, or a set logged under it) is lifted to the bar, so no barbell
 * prescription -- decision or prefill -- comes out under it. The two-miss copy
 * names the weight without claiming an exact 10%. Other equipment is
 * unchanged. Every case calls the real evaluateProgression / suggestedWeight.
 */

import {
  evaluateProgression,
  barbellFloorKg,
  suggestedWeight,
  type Decision,
  type ExerciseMeta,
  type LoggedSet,
  type ProgressState,
} from "@/lib/program/progression";
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
const CURL: ExerciseMeta = { ...BENCH, mechanic: "isolation", movementPattern: "biceps" };

/** A missed session: 3 sets planned, reps below the 8-12 range. */
function miss(weightKg: number): LoggedSet[] {
  return [
    { reps: 5, weightKg },
    { reps: 4, weightKg },
    { reps: 3, weightKg },
  ];
}

function run(opts: {
  weightKg: number;
  priorFailures: number;
  failureStartKg: number | null;
  equipmentIds?: string[];
  unit?: WeightUnit | null;
  meta?: ExerciseMeta;
}): Decision {
  const state: ProgressState = {
    currentWorkingWeightKg: opts.weightKg,
    currentTargetReps: 12,
    consecutiveFailures: opts.priorFailures,
    bestWeightKg: opts.weightKg,
    bestReps: 12,
    bestE1rm: null,
    totalSessions: 5,
    weightAtFailureStartKg: opts.failureStartKg,
  };
  return evaluateProgression({
    sets: miss(opts.weightKg),
    plannedSets: 3,
    repsMin: 8,
    repsMax: 12,
    feel: null,
    meta: opts.meta ?? BENCH,
    state,
    isDeload: false,
    equipmentIds: "equipmentIds" in opts ? opts.equipmentIds : ["barbell"],
    unit: "unit" in opts ? opts.unit : "kg",
  });
}

const BAR_LB_KG = Math.round(lbToKg(45) * 100) / 100; // 20.41

console.log("\n=== barbellFloorKg ===\n");
check("barbell, kg -> 20", barbellFloorKg(["barbell"], "kg") === 20, String(barbellFloorKg(["barbell"], "kg")));
check("barbell, lb -> 20.41 (45 lb)", barbellFloorKg(["barbell"], "lb") === 20.41, String(barbellFloorKg(["barbell"], "lb")));
check("barbell, unknown units -> 20", barbellFloorKg(["barbell"], null) === 20);
check("barbell + bench -> 20", barbellFloorKg(["barbell", "bench"], "kg") === 20);
check("dumbbell -> null", barbellFloorKg(["dumbbell"], "kg") === null);
check("ez_bar -> null (unchanged)", barbellFloorKg(["ez_bar"], "kg") === null);
check("no equipment -> null", barbellFloorKg(undefined, "kg") === null);

console.log("\n=== Metric barbell at the empty bar ===\n");
{
  const d = run({ weightKg: 20, priorFailures: 1, failureStartKg: 20 });
  check("2nd miss at 20 kg bench: stays 20 kg (not 17.5)", d.nextWorkingWeightKg === 20, `got ${d.nextWorkingWeightKg}`);
  check("2nd miss: outcome hold", d.outcome === "hold", d.outcome);
  check("2nd miss: counter kept at 2 so the third miss is seen", d.consecutiveFailures === 2, `got ${d.consecutiveFailures}`);
  check("2nd miss: failure-start preserved", d.weightAtFailureStartKg === 20, `got ${d.weightAtFailureStartKg}`);
}
{
  const d = run({ weightKg: 20, priorFailures: 1, failureStartKg: 20, meta: SQUAT });
  check("2nd miss at 20 kg squat: stays 20 kg", d.nextWorkingWeightKg === 20, `got ${d.nextWorkingWeightKg}`);
}
{
  const d = run({ weightKg: 20, priorFailures: 1, failureStartKg: 20, meta: CURL });
  check("2nd miss at 20 kg barbell curl: stays 20 kg", d.nextWorkingWeightKg === 20, `got ${d.nextWorkingWeightKg}`);
}
for (const prior of [2, 3]) {
  const d = run({ weightKg: 20, priorFailures: prior, failureStartKg: 20 });
  check(`miss after ${prior} misses at 20 kg: step-down holds at 20 kg`, d.nextWorkingWeightKg === 20, `got ${d.nextWorkingWeightKg}`);
  check(`  outcome hold`, d.outcome === "hold", d.outcome);
  check(`  counter 3`, d.consecutiveFailures === 3, `got ${d.consecutiveFailures}`);
  check(`  failure-start preserved`, d.weightAtFailureStartKg === 20, `got ${d.weightAtFailureStartKg}`);
  check(
    `  floor message`,
    d.message === "Staying at 20 kg — aim for clean reps.",
    d.message,
  );
}
{
  const d = run({ weightKg: 20, priorFailures: 2, failureStartKg: 20, unit: null });
  check("unknown units: holds at 20 kg", d.nextWorkingWeightKg === 20, `got ${d.nextWorkingWeightKg}`);
  check("unknown units: unit-neutral floor message", d.message === "Staying at this weight — aim for clean reps.", d.message);
}

console.log("\n=== Metric barbell just above the bar ===\n");
{
  // 22 kg pre-miss: 0.9x snaps to 17.5, which is below the bar -> 20 kg
  const d = run({ weightKg: 22, priorFailures: 1, failureStartKg: 22 });
  check("2nd miss from 22 kg: backs off to the bar (20 kg), not 17.5", d.nextWorkingWeightKg === 20, `got ${d.nextWorkingWeightKg}`);
  check("  outcome backed_off", d.outcome === "backed_off", d.outcome);
  check("  message names 20 kg", d.message === "Missed twice in a row — dropping to 20 kg to build back.", d.message);
  check("  counter reset", d.consecutiveFailures === 0, `got ${d.consecutiveFailures}`);
}
{
  const d = run({ weightKg: 60, priorFailures: 1, failureStartKg: 60 });
  check("2nd miss from 60 kg: still 52.5 kg (unchanged)", d.nextWorkingWeightKg === 52.5, `got ${d.nextWorkingWeightKg}`);
}

console.log("\n=== Imperial barbell (45 lb bar) ===\n");
{
  const fifty = Math.round(lbToKg(50) * 100) / 100; // 22.68
  const d = run({ weightKg: fifty, priorFailures: 1, failureStartKg: fifty, unit: "lb" });
  check("2nd miss from 50 lb: backs off to the 45 lb bar (20.41 kg), not 20 kg", d.nextWorkingWeightKg === BAR_LB_KG, `got ${d.nextWorkingWeightKg}`);
  check("  message says 45 lb", d.message === "Missed twice in a row — dropping to 45 lb to build back.", d.message);
}
{
  const d = run({ weightKg: BAR_LB_KG, priorFailures: 1, failureStartKg: BAR_LB_KG, unit: "lb" });
  check("2nd miss at 45 lb: holds at 45 lb", d.nextWorkingWeightKg === BAR_LB_KG && d.outcome === "hold", `${d.outcome} ${d.nextWorkingWeightKg}`);
}
{
  const d = run({ weightKg: BAR_LB_KG, priorFailures: 2, failureStartKg: BAR_LB_KG, unit: "lb" });
  check("3rd miss at 45 lb: holds at 45 lb", d.nextWorkingWeightKg === BAR_LB_KG && d.outcome === "hold", `${d.outcome} ${d.nextWorkingWeightKg}`);
  check("  floor message in lb", d.message === "Staying at 45 lb — aim for clean reps.", d.message);
}
{
  // An unrounded 45 lb (20.4117 kg) is still the bar, not a weight above it
  const raw = lbToKg(45);
  const d = run({ weightKg: raw, priorFailures: 1, failureStartKg: raw, unit: "lb" });
  check("2nd miss at unrounded 45 lb: holds (no 0.0017 kg 'back-off')", d.outcome === "hold" && d.nextWorkingWeightKg === raw, `${d.outcome} ${d.nextWorkingWeightKg}`);
}

console.log("\n=== Start below the bar: nothing comes out under 20 kg ===\n");
{
  // QA1 (report-bot1-661d-gaps): a 5 kg barbell bench, f1 wafs 5
  const d2 = run({ weightKg: 5, priorFailures: 1, failureStartKg: 5 });
  check("5 kg bench, 2nd miss: 20 kg (the bar), not 5 or 2.5", d2.nextWorkingWeightKg === 20 && d2.outcome === "hold", `${d2.outcome} ${d2.nextWorkingWeightKg}`);
  const d3 = run({ weightKg: 5, priorFailures: 2, failureStartKg: 5 });
  check("5 kg bench, 3rd miss: holds at the bar, never 2.5 kg", d3.nextWorkingWeightKg === 20, `got ${d3.nextWorkingWeightKg}`);
  check("  floor message names 20 kg", d3.message === "Staying at 20 kg — aim for clean reps.", d3.message);
  const d1 = run({ weightKg: 5, priorFailures: 0, failureStartKg: null });
  check("5 kg bench, 1st miss: 20 kg", d1.nextWorkingWeightKg === 20, `got ${d1.nextWorkingWeightKg}`);
  check("  failure-start recorded at the bar", d1.weightAtFailureStartKg === 20, `got ${d1.weightAtFailureStartKg}`);
}
{
  const d = run({ weightKg: 15, priorFailures: 1, failureStartKg: 15 });
  check("15 kg barbell, 2nd miss: hold at 20 kg", d.nextWorkingWeightKg === 20 && d.outcome === "hold", `${d.outcome} ${d.nextWorkingWeightKg}`);
  const d3 = run({ weightKg: 15, priorFailures: 2, failureStartKg: 15 });
  check("15 kg barbell, 3rd miss: floor hold at 20 kg", d3.nextWorkingWeightKg === 20 && d3.message === "Staying at 20 kg — aim for clean reps.", `${d3.nextWorkingWeightKg} ${d3.message}`);
}
{
  const d = run({ weightKg: 15, priorFailures: 1, failureStartKg: 15, unit: "lb" });
  check("15 kg barbell, imperial: holds at the 45 lb bar (20.41 kg)", d.nextWorkingWeightKg === BAR_LB_KG, `got ${d.nextWorkingWeightKg}`);
}
{
  // Success from under the bar steps from the bar
  const d = evaluateProgression({
    sets: [1, 2, 3].map(() => ({ reps: 12, weightKg: 5 })),
    plannedSets: 3, repsMin: 8, repsMax: 12, feel: "right", meta: BENCH,
    state: { currentWorkingWeightKg: 5, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: 5, bestReps: 12, bestE1rm: null, totalSessions: 3, weightAtFailureStartKg: null },
    isDeload: false, equipmentIds: ["barbell"], unit: "kg",
  });
  check("5 kg bench success: steps from the bar to 22.5 kg", d.nextWorkingWeightKg === 22.5, `got ${d.nextWorkingWeightKg}`);
  check("  message 'up to 22.5 kg'", d.message === "All sets at the top of the range — up to 22.5 kg.", d.message);
  check("  bests still from the raw sets (5 kg)", d.bestWeightKg === 5, `got ${d.bestWeightKg}`);
}
{
  // No stored weight, sets logged at 15 kg
  const d = evaluateProgression({
    sets: [1, 2, 3].map(() => ({ reps: 12, weightKg: 15 })),
    plannedSets: 3, repsMin: 8, repsMax: 12, feel: "right", meta: BENCH,
    state: { currentWorkingWeightKg: null, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false, equipmentIds: ["barbell"], unit: "kg",
  });
  check("no stored weight, 3×12 at 15 kg: next 22.5 kg (not 17.5)", d.nextWorkingWeightKg === 22.5, `got ${d.nextWorkingWeightKg}`);
  const m = evaluateProgression({
    sets: [1, 2, 3].map(() => ({ reps: 5, weightKg: 15 })),
    plannedSets: 3, repsMin: 8, repsMax: 12, feel: null, meta: BENCH,
    state: { currentWorkingWeightKg: null, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: null, bestReps: null, bestE1rm: null, totalSessions: 0, weightAtFailureStartKg: null },
    isDeload: false, equipmentIds: ["barbell"], unit: "kg",
  });
  check("no stored weight, missed at 15 kg: holds at 20 kg", m.nextWorkingWeightKg === 20, `got ${m.nextWorkingWeightKg}`);
}
{
  const base = { currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: 5, bestReps: 12, bestE1rm: null, totalSessions: 3, weightAtFailureStartKg: null };
  const inRange = evaluateProgression({
    sets: [1, 2, 3].map(() => ({ reps: 9, weightKg: 5 })),
    plannedSets: 3, repsMin: 8, repsMax: 12, feel: "right", meta: BENCH,
    state: { ...base, currentWorkingWeightKg: 5 }, isDeload: false, equipmentIds: ["barbell"], unit: "kg",
  });
  check("5 kg bench in range: holds at 20 kg", inRange.nextWorkingWeightKg === 20, `got ${inRange.nextWorkingWeightKg}`);
  const deload = evaluateProgression({
    sets: [1, 2, 3].map(() => ({ reps: 9, weightKg: 5 })),
    plannedSets: 3, repsMin: 8, repsMax: 12, feel: "right", meta: BENCH,
    state: { ...base, currentWorkingWeightKg: 5 }, isDeload: true, equipmentIds: ["barbell"], unit: "kg",
  });
  check("5 kg bench deload week: 20 kg", deload.nextWorkingWeightKg === 20, `got ${deload.nextWorkingWeightKg}`);
}

console.log("\n=== suggestedWeight (runner and swap prefill) never under the bar ===\n");
{
  check("barbell 15 kg, normal week: prefill 20", suggestedWeight({ currentWorkingWeightKg: 15 }, false, BENCH, ["barbell"]) === 20);
  check("barbell 25 kg, deload week: 20 (not 17.5)", suggestedWeight({ currentWorkingWeightKg: 25 }, true, BENCH, ["barbell"]) === 20,
    String(suggestedWeight({ currentWorkingWeightKg: 25 }, true, BENCH, ["barbell"])));
  check("barbell 25 kg, deload week, lb: 20.41 (45 lb)", suggestedWeight({ currentWorkingWeightKg: 25 }, true, BENCH, ["barbell"], "lb") === BAR_LB_KG);
  check("barbell 60 kg, deload week: 42.5 (unchanged)", suggestedWeight({ currentWorkingWeightKg: 60 }, true, BENCH, ["barbell"]) === 42.5,
    String(suggestedWeight({ currentWorkingWeightKg: 60 }, true, BENCH, ["barbell"])));
  check("barbell 40 kg, normal week: 40 (unchanged)", suggestedWeight({ currentWorkingWeightKg: 40 }, false, BENCH, ["barbell"]) === 40);
  check("dumbbell 25 kg, deload week: 17.5 (unchanged)", suggestedWeight({ currentWorkingWeightKg: 25 }, true, BENCH, ["dumbbell"]) === 17.5,
    String(suggestedWeight({ currentWorkingWeightKg: 25 }, true, BENCH, ["dumbbell"])));
  check("dumbbell 15 kg, normal week: 15 (unchanged)", suggestedWeight({ currentWorkingWeightKg: 15 }, false, BENCH, ["dumbbell"]) === 15);
}

console.log("\n=== Sweep: no barbell prescription below the bar ===\n");
{
  let cases = 0;
  const bad: string[] = [];
  for (const unit of ["kg", "lb", null] as const) {
    const floor = barbellFloorKg(["barbell"], unit)!;
    for (let w = 1.25; w <= 60; w += 1.25) {
      for (const meta of [BENCH, SQUAT, CURL]) {
        for (const reps of [3, 9, 12]) {
          for (const prior of [0, 1, 2, 3]) {
            for (const isDeload of [false, true]) {
              for (const feel of ["easy", "right", "hard", null] as const) {
                const d = evaluateProgression({
                  sets: [1, 2, 3].map(() => ({ reps, weightKg: w })),
                  plannedSets: 3, repsMin: 8, repsMax: 12, feel, meta,
                  state: { currentWorkingWeightKg: w, currentTargetReps: 12, consecutiveFailures: prior, bestWeightKg: w, bestReps: 12, bestE1rm: null, totalSessions: 3, weightAtFailureStartKg: prior > 0 ? w : null },
                  isDeload, equipmentIds: ["barbell"], unit,
                });
                cases++;
                if (d.nextWorkingWeightKg !== null && d.nextWorkingWeightKg < floor - 0.005 && bad.length < 5) {
                  bad.push(`${unit} ${meta.movementPattern} ${w} reps ${reps} f${prior} deload ${isDeload}: ${d.nextWorkingWeightKg}`);
                }
              }
            }
          }
        }
      }
      for (const isDeload of [false, true]) {
        cases++;
        const sw = suggestedWeight({ currentWorkingWeightKg: w }, isDeload, BENCH, ["barbell"], unit);
        if (sw !== null && sw < floor - 0.005 && bad.length < 5) bad.push(`suggestedWeight ${unit} ${w} deload ${isDeload}: ${sw}`);
      }
    }
  }
  check(`${cases} barbell decisions and prefills: none below the bar`, bad.length === 0, bad.join("; "));
}

console.log("\n=== Two-miss copy: no exact-10% claim ===\n");
{
  const backOff = run({ weightKg: 60, priorFailures: 1, failureStartKg: 60 });
  check("60 kg 2nd miss: 'dropping to 52.5 kg' with no percentage", backOff.message === "Missed twice in a row — dropping to 52.5 kg to build back.", backOff.message);
  const hold = run({ weightKg: 20, priorFailures: 1, failureStartKg: 20 });
  check("20 kg 2nd miss hold: no '10%' in the copy", hold.message === "Missed twice in a row but no lighter loadable weight is close enough — holding to build back up.", hold.message);
  const hold3 = run({ weightKg: 12.5, priorFailures: 2, failureStartKg: 12.5, equipmentIds: ["dumbbell"] });
  check("dumbbell 12.5 3rd miss: steps down with no percentage", !hold3.message.includes("%"), hold3.message);
  let withPct = 0;
  let missCases = 0;
  const ex: string[] = [];
  for (const eq of [["barbell"], ["dumbbell"], ["kettlebell"], ["cable_machine"], ["medicine_ball"], undefined] as Array<string[] | undefined>) {
    for (const unit of ["kg", "lb", null] as const) {
      for (let w = 2.5; w <= 120; w += 2.5) {
        for (const prior of [1, 2, 3]) {
          const d = run({ weightKg: w, priorFailures: prior, failureStartKg: w, equipmentIds: eq, unit });
          missCases++;
          if (d.message.includes("%")) {
            withPct++;
            if (ex.length < 3) ex.push(d.message);
          }
        }
      }
    }
  }
  check(`${missCases} repeated-miss messages: none quote a percentage`, withPct === 0, ex.join(" | "));
}

console.log("\n=== Miss streak from 30 kg never goes under the bar ===\n");
{
  let w = 30;
  let prior = 0;
  let start: number | null = null;
  let lowest = w;
  for (let i = 0; i < 12; i++) {
    const d = run({ weightKg: w, priorFailures: prior, failureStartKg: start });
    w = d.nextWorkingWeightKg ?? w;
    prior = d.consecutiveFailures;
    start = d.weightAtFailureStartKg;
    lowest = Math.min(lowest, w);
  }
  check("lowest weight over 12 misses is 20 kg", lowest === 20, `got ${lowest}`);
  check("ends holding at 20 kg", w === 20, `got ${w}`);
}

console.log("\n=== Non-barbell equipment unchanged ===\n");
for (const eq of [["dumbbell"], ["cable_machine"], ["ez_bar"], ["smith_machine"]]) {
  const d = run({ weightKg: 20, priorFailures: 1, failureStartKg: 20, equipmentIds: eq });
  check(`2nd miss at 20 kg ${eq[0]}: still 17.5`, d.nextWorkingWeightKg === 17.5, `got ${d.nextWorkingWeightKg}`);
}
{
  const d = run({ weightKg: 20, priorFailures: 1, failureStartKg: 20, equipmentIds: undefined });
  check("2nd miss at 20 kg, no equipment info: still 17.5", d.nextWorkingWeightKg === 17.5, `got ${d.nextWorkingWeightKg}`);
}

console.log();
if (failures > 0) {
  console.log(`❌ ${failures} check(s) failed`);
  process.exit(1);
}
console.log("All barbell bar-floor checks passed.");
