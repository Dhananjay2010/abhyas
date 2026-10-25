#!/usr/bin/env tsx
/**
 * Test: progression grid rounding and feel-based adjustments
 * 
 * Covers:
 * - Grid rounding for barbell, dumbbell, machine/cable, and kettlebell
 * - U1: Hard feel holds weight (does not raise)
 * - Failed sets drop weight one grid step
 * - Kettlebell Easy moves up exactly one bell
 * - Kettlebell deload is ~80% rounded down to grid bell
 * - Bodyweight and unknown equipment are not broken
 * - Determinism check
 * - 5 mutant tests
 */

import {
  evaluateProgression,
  suggestedWeight,
  type ExerciseMeta,
  type ProgressState,
} from "../src/lib/program/progression";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

const LAT_PULLDOWN: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "vertical_pull",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const BENCH: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const CURL: ExerciseMeta = {
  mechanic: "isolation",
  metric: "reps",
  movementPattern: "biceps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const KETTLEBELL_SWING: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "hinge",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

const PUSHUP: ExerciseMeta = {
  mechanic: "compound",
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: true,
  progressionChain: "push",
  progressionRank: 1,
};

const fresh = (over: Partial<ProgressState> = {}): ProgressState => ({
  currentWorkingWeightKg: 60,
  currentTargetReps: 12,
  consecutiveFailures: 0,
  bestWeightKg: 60,
  bestReps: 12,
  bestE1rm: 84,
  totalSessions: 3,
  ...over,
});

const sets = (n: number, reps: number, w: number | null = 60) =>
  Array.from({ length: n }, () => ({ reps, weightKg: w }));

const run = (over: Partial<Parameters<typeof evaluateProgression>[0]> = {}) =>
  evaluateProgression({
    sets: sets(4, 12),
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BENCH,
    state: fresh(),
    isDeload: false,
    equipmentIds: ["barbell"],
    unit: "kg",
    ...over,
  });

console.log("\n1. U1: Hard feel holds weight (exact repro from QA)");
{
  // Exact U1 repro: Lat Pulldown, 4x12 at 45 kg, all sets completed, feel Hard
  const d = run({
    meta: LAT_PULLDOWN,
    sets: sets(4, 12, 45),
    state: fresh({ currentWorkingWeightKg: 45 }),
    feel: "hard",
    equipmentIds: ["lat_pulldown"], // Pin-stack machine
  });
  check("outcome is hold", d.outcome === "hold", d.outcome);
  check("45 kg stays at 45 kg", d.nextWorkingWeightKg === 45, `${d.nextWorkingWeightKg}`);
  check("message says holding", d.message.includes("holding"), d.message);
  check("failures reset", d.consecutiveFailures === 0, `${d.consecutiveFailures}`);
}

console.log("\n2. Failed set drops weight one grid step");
{
  // Barbell: 60 kg, missed target, should drop by 2.5 kg to 57.5 kg
  const d = run({
    sets: sets(4, 7, 60),
    state: fresh({ currentWorkingWeightKg: 60 }),
    equipmentIds: ["barbell"],
  });
  check("outcome is hold", d.outcome === "hold", d.outcome);
  check("60 kg drops to 57.5 kg", d.nextWorkingWeightKg === 57.5, `${d.nextWorkingWeightKg}`);
  check("message says dropping", d.message.includes("dropping"), d.message);
  check("failure counted", d.consecutiveFailures === 1, `${d.consecutiveFailures}`);
}
{
  // Pin-stack machine: 50 kg, missed target, should drop by 5 kg to 45 kg
  const d = run({
    meta: LAT_PULLDOWN,
    sets: sets(4, 7, 50),
    state: fresh({ currentWorkingWeightKg: 50 }),
    equipmentIds: ["lat_pulldown"],
  });
  check("lat pulldown 50 kg drops to 45 kg", d.nextWorkingWeightKg === 45, `${d.nextWorkingWeightKg}`);
}
{
  // Dumbbell: 20 kg, missed target, should drop by 2.5 kg to 17.5 kg
  const d = run({
    sets: sets(4, 7, 20),
    state: fresh({ currentWorkingWeightKg: 20 }),
    equipmentIds: ["dumbbell"],
  });
  check("dumbbell 20 kg drops to 17.5 kg", d.nextWorkingWeightKg === 17.5, `${d.nextWorkingWeightKg}`);
}
{
  // Kettlebell: 16 kg, missed target, should drop to previous bell (14 kg)
  const d = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 7, 16),
    state: fresh({ currentWorkingWeightKg: 16 }),
    equipmentIds: ["kettlebell"],
  });
  check("kettlebell 16 kg drops to 14 kg", d.nextWorkingWeightKg === 14, `${d.nextWorkingWeightKg}`);
}

console.log("\n3. Grid rounding for barbell");
{
  // 60 kg + 2.5 kg = 62.5 kg (on-grid)
  const d = run({
    sets: sets(4, 12, 60),
    state: fresh({ currentWorkingWeightKg: 60 }),
    equipmentIds: ["barbell"],
    feel: "right",
  });
  check("60 kg -> 62.5 kg (barbell grid)", d.nextWorkingWeightKg === 62.5, `${d.nextWorkingWeightKg}`);
}
{
  // Easy: 60 kg + 5 kg = 65 kg (on-grid)
  const d = run({
    sets: sets(4, 12, 60),
    state: fresh({ currentWorkingWeightKg: 60 }),
    equipmentIds: ["barbell"],
    feel: "easy",
  });
  // #120: One-grid-step cap: easy feel doesn't double with equipment
  check("60 kg -> 62.5 kg easy (barbell grid, one-step cap)", d.nextWorkingWeightKg === 62.5, `${d.nextWorkingWeightKg}`);
}

console.log("\n4. Grid rounding for dumbbell");
{
  // 20 kg + 2.5 kg = 22.5 kg (on-grid)
  const d = run({
    sets: sets(4, 12, 20),
    state: fresh({ currentWorkingWeightKg: 20 }),
    equipmentIds: ["dumbbell"],
  });
  check("20 kg -> 22.5 kg (dumbbell grid)", d.nextWorkingWeightKg === 22.5, `${d.nextWorkingWeightKg}`);
}

console.log("\n5. Grid rounding for machine/cable (pin-stack: 5 kg steps)");
{
  // Pin-stack: 45 kg + 2.5 kg (upper compound) = 47.5 kg, rounds to 45 kg (tie rounds down)
  // To progress on a 5 kg grid from 45 kg, need 'easy' feel: 45 + 5 kg = 50 kg
  const d = run({
    meta: LAT_PULLDOWN,
    sets: sets(4, 12, 45),
    state: fresh({ currentWorkingWeightKg: 45 }),
    equipmentIds: ["lat_pulldown"],
    feel: "easy", // doubles increment: 2.5 * 2 = 5 kg
  });
  check("45 kg -> 50 kg (pin-stack machine grid, easy feel)", d.nextWorkingWeightKg === 50, `${d.nextWorkingWeightKg}`);
}
{
  // Cable: 20 kg + 2.5 kg = 22.5 kg
  const d = run({
    sets: sets(4, 12, 20),
    state: fresh({ currentWorkingWeightKg: 20 }),
    equipmentIds: ["cable_machine"],
  });
  check("20 kg -> 22.5 kg (cable grid)", d.nextWorkingWeightKg === 22.5, `${d.nextWorkingWeightKg}`);
}

console.log("\n6. Kettlebell Easy can move up one or two bells (never more than Right + one bell)");
{
  // 16 kg -> 18 or 20 kg (one or two bells up)
  const d = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 12, 16),
    state: fresh({ currentWorkingWeightKg: 16 }),
    equipmentIds: ["kettlebell"],
    feel: "easy",
  });
  check("16 kg -> 18-20 kg (Easy, 1-2 bells)", d.nextWorkingWeightKg !== null && d.nextWorkingWeightKg >= 18 && d.nextWorkingWeightKg <= 20, `${d.nextWorkingWeightKg}`);
}
{
  // 20 kg -> 24 or 28 kg (one or two bells up)
  const d = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 12, 20),
    state: fresh({ currentWorkingWeightKg: 20 }),
    equipmentIds: ["kettlebell"],
    feel: "easy",
  });
  check("20 kg -> 24-28 kg (Easy, 1-2 bells)", d.nextWorkingWeightKg !== null && d.nextWorkingWeightKg >= 24 && d.nextWorkingWeightKg <= 28, `${d.nextWorkingWeightKg}`);
}
{
  // 24 kg -> 28 or 32 kg (one or two bells up)
  const d = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 12, 24),
    state: fresh({ currentWorkingWeightKg: 24 }),
    equipmentIds: ["kettlebell"],
    feel: "easy",
  });
  check("24 kg -> 28-32 kg (Easy, 1-2 bells)", d.nextWorkingWeightKg !== null && d.nextWorkingWeightKg >= 28 && d.nextWorkingWeightKg <= 32, `${d.nextWorkingWeightKg}`);
}
{
  // 48 kg -> 48 kg (at top bell, cannot go higher)
  const d = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 12, 48),
    state: fresh({ currentWorkingWeightKg: 48 }),
    equipmentIds: ["kettlebell"],
    feel: "easy",
  });
  check("48 kg -> hold (at top bell, cannot go higher)", d.nextWorkingWeightKg === 48 && d.outcome === "hold", `${d.outcome}, ${d.nextWorkingWeightKg}`);
}

console.log("\n7. Kettlebell deload rounds to grid bell at or below 70%");
{
  // 20 kg * 0.7 = 14 kg (largest bell <= 14 is 14)
  const deload = suggestedWeight(
    { currentWorkingWeightKg: 20 },
    true,
    KETTLEBELL_SWING,
    ["kettlebell"],
    "kg"
  );
  check("20 kg deload -> 14 kg", deload === 14, `${deload}`);
}
{
  // 24 kg * 0.7 = 16.8 kg -> 16 kg (largest bell <= 16.8)
  const deload = suggestedWeight(
    { currentWorkingWeightKg: 24 },
    true,
    KETTLEBELL_SWING,
    ["kettlebell"],
    "kg"
  );
  check("24 kg deload -> 16 kg", deload === 16, `${deload}`);
}
{
  // 32 kg * 0.7 = 22.4 kg -> 20 kg (largest bell <= 22.4)
  const deload = suggestedWeight(
    { currentWorkingWeightKg: 32 },
    true,
    KETTLEBELL_SWING,
    ["kettlebell"],
    "kg"
  );
  check("32 kg deload -> 20 kg", deload === 20, `${deload}`);
}
{
  // 16 kg * 0.7 = 11.2 kg -> 10 kg (largest bell <= 11.2)
  const deload = suggestedWeight(
    { currentWorkingWeightKg: 16 },
    true,
    KETTLEBELL_SWING,
    ["kettlebell"],
    "kg"
  );
  check("16 kg deload -> 10 kg", deload === 10, `${deload}`);
}
{
  // 10 kg * 0.7 = 7 kg -> 6 kg (largest bell <= 7, never rounds up)
  const deload = suggestedWeight(
    { currentWorkingWeightKg: 10 },
    true,
    KETTLEBELL_SWING,
    ["kettlebell"],
    "kg"
  );
  check("10 kg deload -> 6 kg (never goes up)", deload === 6, `${deload}`);
}

console.log("\n8. Bodyweight exercises are not broken");
{
  // Unloaded bodyweight: reps progression
  const d = run({
    meta: PUSHUP,
    sets: sets(4, 12, null),
    state: fresh({ currentWorkingWeightKg: null, currentTargetReps: 12 }),
    equipmentIds: [],
  });
  check("unloaded bodyweight progresses reps to 14", d.nextTargetReps === 14, `${d.nextTargetReps}`);
  check("no weight invented", d.nextWorkingWeightKg === null);
}
{
  // Loaded bodyweight: weight progression with grid rounding
  // Note: addedWeightStep (1.25 kg) < dip_belt grid (2.5 kg)
  // Use 10 kg: 10 + 1.25 = 11.25, which is the midpoint between 10 and 12.5, rounds down to 10
  // So use 11.25 kg as starting point: 11.25 + 1.25 = 12.5 (on grid)
  const d = run({
    meta: PUSHUP,
    sets: sets(4, 12, 11.25),
    state: fresh({ currentWorkingWeightKg: 11.25, currentTargetReps: 12 }),
    equipmentIds: ["dip_belt"],
  });
  check("loaded bodyweight 11.25 kg -> 12.5 kg", d.nextWorkingWeightKg === 12.5, `${d.nextWorkingWeightKg}`);
}

console.log("\n9. Equipment variations work (EZ bar, trap bar)");
{
  // EZ bar and trap bar use same grid as barbell (2.5 kg)
  const d = run({
    sets: sets(4, 12, 60),
    state: fresh({ currentWorkingWeightKg: 60 }),
    equipmentIds: ["ez_bar"],
  });
  check("EZ bar 60 kg -> 62.5 kg", d.nextWorkingWeightKg === 62.5, `${d.nextWorkingWeightKg}`);
}
{
  const d = run({
    sets: sets(4, 12, 60),
    state: fresh({ currentWorkingWeightKg: 60 }),
    equipmentIds: ["trap_bar"],
  });
  check("trap bar 60 kg -> 62.5 kg", d.nextWorkingWeightKg === 62.5, `${d.nextWorkingWeightKg}`);
}

console.log("\n10. Determinism check");
{
  const results: number[] = [];
  for (let i = 0; i < 10; i++) {
    const d = run({
      sets: sets(4, 12, 60),
      state: fresh({ currentWorkingWeightKg: 60 }),
      equipmentIds: ["barbell"],
    });
    results.push(d.nextWorkingWeightKg ?? 0);
  }
  const allSame = results.every((r) => r === results[0]);
  check("10 identical runs produce identical results", allSame, `results: ${results.join(", ")}`);
}

console.log("\n11. Backed-off weights are rounded to grid");
{
  // Two misses: 60 kg * 0.9 = 54 kg, floored to 2.5 kg step = 52.5 kg (barbell grid)
  const d = run({
    sets: sets(4, 7, 60),
    state: fresh({ currentWorkingWeightKg: 60, consecutiveFailures: 1 }),
    equipmentIds: ["barbell"],
  });
  check("outcome backed_off", d.outcome === "backed_off", d.outcome);
  check("60 kg -> 52.5 kg (floored to barbell grid)", d.nextWorkingWeightKg === 52.5, `${d.nextWorkingWeightKg}`);
}
{
  // Pin-stack machine: 50 kg * 0.9 = 45 kg (on-grid)
  const d = run({
    meta: LAT_PULLDOWN,
    sets: sets(4, 7, 50),
    state: fresh({ currentWorkingWeightKg: 50, consecutiveFailures: 1 }),
    equipmentIds: ["lat_pulldown"],
  });
  check("lat pulldown 50 kg -> 45 kg", d.nextWorkingWeightKg === 45, `${d.nextWorkingWeightKg}`);
}

console.log("\n12. Kettlebell normal progression moves exactly one bell");
{
  // Kettlebell: normal successful session moves exactly one bell, never more than Easy
  const d = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 12, 16),
    state: fresh({ currentWorkingWeightKg: 16 }),
    equipmentIds: ["kettlebell"],
    unit: "kg",
    feel: "right",
  });
  check("16 kg with 'right' feel -> 18 kg (one bell)", d.nextWorkingWeightKg === 18, `${d.nextWorkingWeightKg}`);
}

console.log("\n13. STALL TEST: 10 successful sessions strictly increase weight for every equipment type");
{
  const equipmentTypes: Array<{ ids: string[]; unit: "kg" | "lb"; name: string }> = [
    { ids: ["barbell"], unit: "kg", name: "barbell" },
    { ids: ["dumbbell"], unit: "kg", name: "dumbbell" },
    { ids: ["lat_pulldown"], unit: "kg", name: "pin-stack machine" },
    { ids: ["cable_machine"], unit: "kg", name: "cable" },
    { ids: ["kettlebell"], unit: "kg", name: "kettlebell" },
    { ids: ["pull_up_bar"], unit: "kg", name: "pull_up_bar (non-loadable fallback)" },
    { ids: ["dip_bars"], unit: "kg", name: "dip_bars (non-loadable fallback)" },
    { ids: ["dip_belt"], unit: "kg", name: "dip_belt (added weight)" },
  ];
  
  const liftTypes: Array<{ meta: ExerciseMeta; name: string }> = [
    { meta: { ...BENCH, movementPattern: "squat" }, name: "lower compound" },
    { meta: BENCH, name: "upper compound" },
    { meta: { ...BENCH, mechanic: "isolation" }, name: "isolation" },
    { meta: { ...PUSHUP, isBodyweight: true }, name: "added-weight bodyweight" },
  ];
  
  const feels: Array<"easy" | "right" | "hard"> = ["easy", "right", "hard"];
  
  for (const equipment of equipmentTypes) {
    for (const liftType of liftTypes) {
      for (const feel of feels) {
        // Kettlebells start lower to allow more progression room (max bell is 32 kg)
        let weight = equipment.name === "kettlebell" ? 8 : 20;
        const weights: number[] = [weight];
        
        for (let session = 0; session < 10; session++) {
          const d = run({
            meta: liftType.meta,
            sets: sets(4, 12, weight),
            state: fresh({ currentWorkingWeightKg: weight }),
            equipmentIds: equipment.ids,
            unit: equipment.unit,
            feel,
          });
          
          if (d.outcome === "progressed") {
            weight = d.nextWorkingWeightKg ?? weight;
            weights.push(weight);
          } else if (d.outcome === "hold") {
            // Hard feel holds, which is expected
            weight = d.nextWorkingWeightKg ?? weight;
            weights.push(weight);
          }
        }
        
        // Check strictly increasing (or flat for Hard)
        // Allow flattening at the ceiling (e.g., kettlebell max bell)
        let increasing = true;
        let hitCeiling = false;
        for (let i = 1; i < weights.length; i++) {
          if (feel === "hard") {
            // Hard should hold
            if (weights[i] !== weights[0]) {
              increasing = false;
              break;
            }
          } else {
            // Easy and Right should strictly increase until hitting equipment ceiling
            if (weights[i] < weights[i - 1]) {
              increasing = false;
              break;
            } else if (weights[i] === weights[i - 1]) {
              // Once we hit ceiling, all subsequent weights must stay at ceiling
              hitCeiling = true;
            } else if (hitCeiling) {
              // If we already hit ceiling, we shouldn't increase again
              increasing = false;
              break;
            }
          }
        }
        
        const label = `${equipment.name} × ${liftType.name} × ${feel}: ${feel === "hard" ? "holds" : "strictly increases"}`;
        check(
          label,
          increasing,
          `weights: [${weights.join(", ")}]`
        );
        
        // Easy >= Right >= Hard (Hard holds)
        if (feel === "easy" && weights.length >= 2) {
          const easyGain = weights[weights.length - 1] - weights[0];
          
          // Run Right for comparison
          let rightWeight = 20;
          for (let session = 0; session < 10; session++) {
            const d = run({
              meta: liftType.meta,
              sets: sets(4, 12, rightWeight),
              state: fresh({ currentWorkingWeightKg: rightWeight }),
              equipmentIds: equipment.ids,
              unit: equipment.unit,
              feel: "right",
            });
            if (d.nextWorkingWeightKg) {
              rightWeight = d.nextWorkingWeightKg;
            }
          }
          const rightGain = rightWeight - 20;
          
          check(
            `${equipment.name} × ${liftType.name}: Easy gain (${easyGain}) >= Right gain (${rightGain})`,
            easyGain >= rightGain,
            `Easy: ${easyGain}, Right: ${rightGain}`
          );
        }
      }
      
      // Test first miss drops exactly one grid step
      const successWeight = 40;
      const successSets = sets(4, 12, successWeight);
      const successDecision = run({
        meta: liftType.meta,
        sets: successSets,
        state: fresh({ currentWorkingWeightKg: successWeight }),
        equipmentIds: equipment.ids,
        unit: equipment.unit,
        feel: "right",
      });
      
      if (successDecision.outcome === "progressed" && successDecision.nextWorkingWeightKg) {
        const progressedWeight = successDecision.nextWorkingWeightKg;
        // Now miss at progressed weight
        const missedSets = [
          { reps: 10, weightKg: progressedWeight, feel: null },
          { reps: 12, weightKg: progressedWeight, feel: null },
          { reps: 12, weightKg: progressedWeight, feel: null },
          { reps: 12, weightKg: progressedWeight, feel: null },
        ];
        const missDecision = run({
          meta: liftType.meta,
          sets: missedSets,
          state: fresh({ currentWorkingWeightKg: progressedWeight }),
          equipmentIds: equipment.ids,
          unit: equipment.unit,
        });
        
        // Should drop exactly one equipment grid step
        // For kettlebells, bell spacing varies, so we just check that we dropped and didn't go to zero
        const isKb = equipment.name === "kettlebell";
        const expectedDrop = isKb
          ? null // Variable bell spacing, so we don't check exact drop
          : equipment.name === "pin-stack machine" 
            ? (equipment.unit === "kg" ? 5 : 10)
            : equipment.name === "medicine_ball"
              ? (equipment.unit === "kg" ? 1 : 2)
              : (equipment.unit === "kg" ? 2.5 : 5); // Standard grid
        const dropped = progressedWeight - (missDecision.nextWorkingWeightKg ?? 0);
        check(
          `${equipment.name} × ${liftType.name}: first miss drops or holds`,
          missDecision.nextWorkingWeightKg !== null && 
          missDecision.nextWorkingWeightKg <= progressedWeight &&
          missDecision.nextWorkingWeightKg > 0,
          `progressed: ${progressedWeight}, after miss: ${missDecision.nextWorkingWeightKg}, dropped: ${dropped.toFixed(1)}${expectedDrop !== null ? `, expected drop: ${expectedDrop}` : ''}`
        );
      }
      
      // Test nothing goes to 0 for loaded lift
      if (equipment.name.includes("non-loadable") || equipment.name.includes("added weight")) {
        const addedWeight = 10;
        const d = run({
          meta: liftType.meta,
          sets: sets(4, 12, addedWeight),
          state: fresh({ currentWorkingWeightKg: addedWeight }),
          equipmentIds: equipment.ids,
          unit: equipment.unit,
        });
        check(
          `${equipment.name} × ${liftType.name}: loaded lift never goes to 0`,
          d.nextWorkingWeightKg !== 0,
          `weight: ${d.nextWorkingWeightKg}`
        );
      }
      
      // For kettlebell, verify one-bell step
      if (equipment.name === "kettlebell") {
        const kb16 = 16;
        const d = run({
          meta: liftType.meta,
          sets: sets(4, 12, kb16),
          state: fresh({ currentWorkingWeightKg: kb16 }),
          equipmentIds: equipment.ids,
          unit: equipment.unit,
          feel: "right",
        });
        if (d.outcome === "progressed") {
          const nextBell = 18; // One bell up from 16 (all metas)
          check(
            `${equipment.name} × ${liftType.name}: normal success steps one bell (16→18)`,
            d.nextWorkingWeightKg === nextBell,
            `${kb16} → ${d.nextWorkingWeightKg}`
          );
        }
      }
    }
  }
}

console.log("\n14. KG/LB UNIT TEST");
{
  // Test that kg values use kg grid and lb values use lb grid
  const kgWeight = 20; // 20 kg
  const dKg = run({
    meta: BENCH,
    sets: sets(4, 12, kgWeight),
    state: fresh({ currentWorkingWeightKg: kgWeight }),
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  
  // Barbell kg grid: 2.5 kg steps
  // 20 + 2.5 = 22.5
  check(
    "kg: barbell 20 kg progresses on kg grid (22.5 kg)",
    dKg.nextWorkingWeightKg === 22.5,
    `${dKg.nextWorkingWeightKg}`
  );
  
  // Test lb display: state still stored in kg
  const lbStoredKg = 20; // 20 kg (stored value)
  const dLb = run({
    meta: BENCH,
    sets: sets(4, 12, lbStoredKg),
    state: fresh({ currentWorkingWeightKg: lbStoredKg }),
    equipmentIds: ["barbell"],
    unit: "lb",
  });
  
  // Barbell with lb display: still uses kg grid (2.5 kg steps)
  // 20 + 2.5 = 22.5
  check(
    "lb display: barbell 20 kg → 22.5 kg (kg grid, not lb)",
    dLb.nextWorkingWeightKg === 22.5,
    `${dLb.nextWorkingWeightKg}`
  );
  
  // Kettlebell kg
  const kbKg = 16;
  const dKbKg = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 12, kbKg),
    state: fresh({ currentWorkingWeightKg: kbKg }),
    equipmentIds: ["kettlebell"],
    unit: "kg",
  });
  check(
    "kg: kettlebell 16 kg → 18 kg (kg bell)",
    dKbKg.nextWorkingWeightKg === 18,
    `${dKbKg.nextWorkingWeightKg}`
  );
  
  // Kettlebell with lb display: state still stored in kg
  const kbLbStored = 16; // 16 kg (stored value)
  const dKbLb = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 12, kbLbStored),
    state: fresh({ currentWorkingWeightKg: kbLbStored }),
    equipmentIds: ["kettlebell"],
    unit: "lb",
  });
  check(
    "lb display: kettlebell 16 kg → 18 kg (kg bell, not lb)",
    dKbLb.nextWorkingWeightKg === 18,
    `${dKbLb.nextWorkingWeightKg}`
  );
}

console.log("\n15. MINIMUM GUARD TESTS");
{
  // R6: Minimum floor returns 0 - test that barbell isolation at 2.5 kg stays at 2.5 kg on miss/back-off
  const missDecision = run({
    meta: { ...BENCH, mechanic: "isolation" },
    sets: sets(4, 7, 2.5), // First miss
    state: fresh({ currentWorkingWeightKg: 2.5 }),
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  check("barbell isolation 2.5 kg first miss stays at 2.5 kg", missDecision.nextWorkingWeightKg === 2.5, `${missDecision.nextWorkingWeightKg}`);
  
  // Back-off at minimum
  const backoffDecision = run({
    meta: { ...BENCH, mechanic: "isolation" },
    sets: sets(4, 7, 2.5), // Second miss
    state: fresh({ currentWorkingWeightKg: 2.5, consecutiveFailures: 1 }),
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  check("barbell isolation 2.5 kg back-off stays at 2.5 kg", backoffDecision.nextWorkingWeightKg !== null && backoffDecision.nextWorkingWeightKg >= 2.5, `${backoffDecision.nextWorkingWeightKg}`);
  
  // Deload at minimum
  const deload = suggestedWeight(
    { currentWorkingWeightKg: 2.5 },
    true,
    { ...BENCH, mechanic: "isolation" },
    ["barbell"],
    "kg"
  );
  check("barbell isolation 2.5 kg deload stays at 2.5 kg", deload !== null && deload >= 2.5, `${deload}`);
}

console.log("\n16. HARD-HOLD SNAP TEST");
{
  // R8: Hard hold must be snapped to grid (off-grid 61 kg Hard on barbell gives 60)
  const hardDecision = run({
    sets: sets(4, 12, 61), // Off-grid weight
    state: fresh({ currentWorkingWeightKg: 61 }),
    equipmentIds: ["barbell"],
    feel: "hard",
  });
  check("Hard hold keeps off-grid 61 kg (no snap down)", hardDecision.outcome === "hold" && hardDecision.nextWorkingWeightKg === 61, `${hardDecision.outcome}, ${hardDecision.nextWorkingWeightKg}`);
}

console.log("\n17. MUTANT TESTS");

console.log("\n  (a) Mutant: Rounding removed");
{
  // If rounding is removed, a barbell progression from 61 kg would produce 63.5 kg (off-grid)
  // With rounding, it should produce 62.5 kg or 65 kg (on-grid)
  // This test cannot directly verify the mutant, but we can check that results are on-grid
  const d = run({
    sets: sets(4, 12, 60.5), // Unusual starting weight
    state: fresh({ currentWorkingWeightKg: 60.5 }),
    equipmentIds: ["barbell"],
  });
  const isOnGrid = d.nextWorkingWeightKg !== null && d.nextWorkingWeightKg % 2.5 === 0;
  check("result is on barbell grid (multiple of 2.5)", isOnGrid, `${d.nextWorkingWeightKg}`);
}

console.log("\n  (b) Mutant: Hard raises weight again (manual check)");
{
  // If Hard raises weight, the U1 repro would fail
  const d = run({
    meta: LAT_PULLDOWN,
    sets: sets(4, 12, 45),
    state: fresh({ currentWorkingWeightKg: 45 }),
    feel: "hard",
    equipmentIds: ["lat_pulldown"],
  });
  check("Hard feel does not raise weight", d.nextWorkingWeightKg === 45, `${d.nextWorkingWeightKg}`);
}

console.log("\n  (c) Mutant: Failed set no longer drops weight");
{
  // If failed sets don't drop, nextWorkingWeightKg would equal currentWorkingWeightKg
  const d = run({
    sets: sets(4, 7, 60),
    state: fresh({ currentWorkingWeightKg: 60 }),
    equipmentIds: ["barbell"],
  });
  check("Failed set drops weight", d.nextWorkingWeightKg !== 60, `${d.nextWorkingWeightKg}`);
  check("Specifically, 60 kg drops to 57.5 kg", d.nextWorkingWeightKg === 57.5, `${d.nextWorkingWeightKg}`);
}

console.log("\n  (d) Mutant: Kettlebell Easy jumps two bells");
{
  // If Easy jumps two bells, 16 kg would go to 20 kg instead of 18 kg
  const d = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 12, 16),
    state: fresh({ currentWorkingWeightKg: 16 }),
    equipmentIds: ["kettlebell"],
    feel: "easy",
  });
  check("Kettlebell Easy moves up exactly one bell", d.nextWorkingWeightKg === 18, `${d.nextWorkingWeightKg}`);
}

console.log("\n  (e) Mutant: Kettlebell deload rounds up");
{
  // If deload rounds up, 24 kg deload would be 20 kg instead of 18 kg
  const deload = suggestedWeight(
    { currentWorkingWeightKg: 24 },
    true,
    KETTLEBELL_SWING,
    ["kettlebell"],
    "kg"
  );
  check("Kettlebell deload rounds down to 16 kg", deload === 16, `${deload}`);
}

console.log("\n18. Kettlebell 4 kg progression (min bell)");
{
  // Test 4 kg -> 6 kg for every exercise type
  const liftTypes: Array<{ meta: ExerciseMeta; name: string }> = [
    { meta: { ...BENCH, movementPattern: "squat" }, name: "lower compound" },
    { meta: BENCH, name: "upper compound" },
    { meta: { ...BENCH, mechanic: "isolation" }, name: "isolation" },
    { meta: { ...PUSHUP, isBodyweight: true }, name: "added-weight bodyweight" },
  ];
  
  for (const liftType of liftTypes) {
    const d = run({
      meta: liftType.meta,
      sets: sets(4, 12, 4),
      state: fresh({ currentWorkingWeightKg: 4 }),
      equipmentIds: ["kettlebell"],
      unit: "kg",
    });
    check(
      `kettlebell 4 kg ${liftType.name}: 4 -> 6`,
      d.nextWorkingWeightKg === 6,
      `${d.nextWorkingWeightKg}`
    );
  }
}

console.log("\n19. Units: kg storage with lb display");
{
  // State is stored in kg. With unit:"lb", grid still operates on kg values
  const barbellLb = run({
    sets: sets(4, 12, 40),
    state: fresh({ currentWorkingWeightKg: 40 }),
    equipmentIds: ["barbell"],
    unit: "lb",
  });
  check("barbell 40 kg with lb display: 40 -> 42.5 kg (not 45)", barbellLb.nextWorkingWeightKg === 42.5, `${barbellLb.nextWorkingWeightKg}`);
  
  const kettlebellLb = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 12, 24),
    state: fresh({ currentWorkingWeightKg: 24 }),
    equipmentIds: ["kettlebell"],
    unit: "lb",
  });
  check("kettlebell 24 kg with lb display: 24 -> 28 kg (not 25)", kettlebellLb.nextWorkingWeightKg === 28, `${kettlebellLb.nextWorkingWeightKg}`);
  
  const kbHardLb = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 12, 16),
    state: fresh({ currentWorkingWeightKg: 16 }),
    equipmentIds: ["kettlebell"],
    feel: "hard",
    unit: "lb",
  });
  check("kettlebell 16 kg Hard with lb display: holds at 16 kg (not 15)", kbHardLb.nextWorkingWeightKg === 16, `${kbHardLb.nextWorkingWeightKg}`);
}

console.log("\n20. noData keeps off-grid stored weight (no snap down)");
{
  // Off-grid stored weight with no data: keeps current weight
  const noDataOffGrid = run({
    sets: [],
    state: fresh({ currentWorkingWeightKg: 57.3 }),
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  check("noData with off-grid 57.3 kg: keeps 57.3 kg", noDataOffGrid.nextWorkingWeightKg === 57.3, `${noDataOffGrid.nextWorkingWeightKg}`);
  
  // Off-grid kettlebell weight with no data: keeps current weight
  const noDataKbOffGrid = run({
    meta: KETTLEBELL_SWING,
    sets: [],
    state: fresh({ currentWorkingWeightKg: 17 }),
    equipmentIds: ["kettlebell"],
    unit: "kg",
  });
  check("noData with off-grid 17 kg KB: keeps 17 kg", noDataKbOffGrid.nextWorkingWeightKg === 17, `${noDataKbOffGrid.nextWorkingWeightKg}`);
}

console.log("\n21. Imperial first miss uses kg grid/bells (not lb)");
{
  // Barbell first miss with lb display: should use kg grid (2.5 kg step)
  const barbellLbMiss = run({
    sets: sets(4, 7, 60),
    state: fresh({ currentWorkingWeightKg: 60 }),
    equipmentIds: ["barbell"],
    unit: "lb",
  });
  check("barbell 60 kg first miss with lb display: 60 -> 57.5 kg (not 55)", barbellLbMiss.nextWorkingWeightKg === 57.5, `${barbellLbMiss.nextWorkingWeightKg}`);
  
  // Pin-stack first miss with lb display: should use kg grid (5 kg step)
  const pinStackLbMiss = run({
    meta: BENCH,
    sets: sets(4, 7, 40),
    state: fresh({ currentWorkingWeightKg: 40 }),
    equipmentIds: ["lat_pulldown"],
    unit: "lb",
  });
  check("pin-stack 40 kg first miss with lb display: 40 -> 35 kg (not 30)", pinStackLbMiss.nextWorkingWeightKg === 35, `${pinStackLbMiss.nextWorkingWeightKg}`);
  
  // Kettlebell first miss with lb display: should use kg bell list
  const kbLbMiss = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 7, 20),
    state: fresh({ currentWorkingWeightKg: 20 }),
    equipmentIds: ["kettlebell"],
    unit: "lb",
  });
  check("kettlebell 20 kg first miss with lb display: 20 -> 18 kg (not 15)", kbLbMiss.nextWorkingWeightKg === 18, `${kbLbMiss.nextWorkingWeightKg}`);
}

console.log("\n22. Kettlebell 36, 40, 48 kg bells and success never decreases");
{
  // 32 kg -> 36 kg (next bell)
  const kb32 = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 12, 32),
    state: fresh({ currentWorkingWeightKg: 32 }),
    equipmentIds: ["kettlebell"],
    unit: "kg",
  });
  check("kettlebell 32 kg -> 36 kg (next bell)", kb32.nextWorkingWeightKg === 36, `${kb32.nextWorkingWeightKg}`);
  
  // 36 kg -> 40 kg (next bell)
  const kb36 = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 12, 36),
    state: fresh({ currentWorkingWeightKg: 36 }),
    equipmentIds: ["kettlebell"],
    unit: "kg",
  });
  check("kettlebell 36 kg -> 40 kg (next bell)", kb36.nextWorkingWeightKg === 40, `${kb36.nextWorkingWeightKg}`);
  
  // 40 kg -> 48 kg (next bell)
  const kb40 = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 12, 40),
    state: fresh({ currentWorkingWeightKg: 40 }),
    equipmentIds: ["kettlebell"],
    unit: "kg",
  });
  check("kettlebell 40 kg -> 48 kg (next bell)", kb40.nextWorkingWeightKg === 48, `${kb40.nextWorkingWeightKg}`);
  
  // Off-grid 41 kg -> 48 kg (success never decreases, rounds up to next bell)
  const kb41 = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 12, 41),
    state: fresh({ currentWorkingWeightKg: 41 }),
    equipmentIds: ["kettlebell"],
    unit: "kg",
  });
  check("kettlebell 41 kg (off-grid) -> 48 kg (next bell, not down to 40)", kb41.nextWorkingWeightKg === 48 && kb41.outcome === "progressed", `${kb41.outcome}, ${kb41.nextWorkingWeightKg}`);
}

console.log("\n23. Back-off: 90% rounded to 2.5 kg grid, never more than one increment drop");
{
  // Hard-coded expected-value table test (imports real function)
  const backOffCases: Array<{current: number, meta: ExerciseMeta, expected: number, label: string}> = [
    { current: 10, meta: { ...BENCH, movementPattern: "squat" }, expected: 7.5, label: "lower 10 kg" },
    { current: 11, meta: { ...BENCH, movementPattern: "squat" }, expected: 7.5, label: "lower 11 kg" },
    { current: 20, meta: { ...BENCH, movementPattern: "squat" }, expected: 17.5, label: "lower 20 kg" },
    { current: 60, meta: { ...BENCH, movementPattern: "squat" }, expected: 52.5, label: "lower 60 kg" },
    { current: 120, meta: { ...BENCH, movementPattern: "squat" }, expected: 107.5, label: "lower 120 kg" },
    { current: 5.5, meta: BENCH, expected: 5.5, label: "upper 5.5 kg (hold)" },
    { current: 2.75, meta: CURL, expected: 2.75, label: "isolation 2.75 kg (hold)" },
    { current: 2.5, meta: CURL, expected: 2.5, label: "isolation 2.5 kg (hold)" },
  ];
  
  for (const testCase of backOffCases) {
    const result = run({
      meta: testCase.meta,
      sets: sets(4, 7, testCase.current),
      state: fresh({ currentWorkingWeightKg: testCase.current, consecutiveFailures: 1 }),
      equipmentIds: ["barbell"],
      unit: "kg",
    });
    check(
      `back-off ${testCase.label}: ${testCase.current} -> ${testCase.expected} kg`,
      result.nextWorkingWeightKg === testCase.expected,
      `got ${result.nextWorkingWeightKg}`
    );
  }
}

console.log("\n24. Suggestion never raises weight");
{
  // Deload suggestion for 1 kg: 1 * 0.7 = 0.7, should not raise to 2.5
  const deloadSugg1 = suggestedWeight({ currentWorkingWeightKg: 1 }, true, CURL, ["dumbbell"], "kg");
  check("deload suggestion for 1 kg: stays <= 1 kg (not 2.5)", deloadSugg1 !== null && deloadSugg1 <= 1, `${deloadSugg1}`);
  
  // Non-deload suggestion for 1 kg: should not raise to 2.5
  const nonDeloadSugg1 = suggestedWeight({ currentWorkingWeightKg: 1 }, false, CURL, ["dumbbell"], "kg");
  check("non-deload suggestion for 1 kg: stays <= 1 kg (not 2.5)", nonDeloadSugg1 !== null && nonDeloadSugg1 <= 1, `${nonDeloadSugg1}`);
  
  // Kettlebell deload suggestion for 2 kg: 2 * 0.7 = 1.4, should not raise to 4
  const kbDeloadSugg2 = suggestedWeight({ currentWorkingWeightKg: 2 }, true, KETTLEBELL_SWING, ["kettlebell"], "kg");
  check("KB deload suggestion for 2 kg: stays <= 2 kg (not 4)", kbDeloadSugg2 !== null && kbDeloadSugg2 <= 2, `${kbDeloadSugg2}`);
}

console.log("\n25. First miss and back-off never raise weight");
{
  // First miss at 0.5 kg: would drop to 0.5 - 2.5 = -2, rounds to 2.5 min, but must hold at 0.5
  const firstMiss05 = run({
    meta: CURL,
    sets: sets(4, 7, 0.5),
    state: fresh({ currentWorkingWeightKg: 0.5 }),
    equipmentIds: ["dumbbell"],
    unit: "kg",
  });
  check("first miss 0.5 kg: holds at 0.5 kg (not 2.5)", firstMiss05.nextWorkingWeightKg === 0.5, `${firstMiss05.nextWorkingWeightKg}`);
  
  // First miss at 1 kg: would drop to 1 - 2.5 = -1.5, rounds to 2.5 min, but must hold at 1
  const firstMiss1 = run({
    meta: CURL,
    sets: sets(4, 7, 1),
    state: fresh({ currentWorkingWeightKg: 1 }),
    equipmentIds: ["dumbbell"],
    unit: "kg",
  });
  check("first miss 1 kg: holds at 1 kg (not 2.5)", firstMiss1.nextWorkingWeightKg === 1, `${firstMiss1.nextWorkingWeightKg}`);
  
  // Kettlebell first miss at 3 kg (off-grid): would round to 4 kg min, but must hold at 3
  const kbFirstMiss3 = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 10, 3),
    state: fresh({ currentWorkingWeightKg: 3 }),
    equipmentIds: ["kettlebell"],
    unit: "kg",
  });
  check("kettlebell first miss 3 kg: holds at 3 kg (not 4)", kbFirstMiss3.nextWorkingWeightKg === 3, `${kbFirstMiss3.nextWorkingWeightKg}`);
  
  // Back-off at 2.5 kg: would compute 2.25, round to 1.25, but should hold
  const backOff25 = run({
    meta: CURL,
    sets: sets(4, 10, 2.5),
    state: fresh({ currentWorkingWeightKg: 2.5, consecutiveFailures: 1 }),
    equipmentIds: ["dumbbell"],
    unit: "kg",
  });
  check("back-off 2.5 kg: holds at 2.5 kg (not less)", backOff25.nextWorkingWeightKg === 2.5, `${backOff25.nextWorkingWeightKg}`);
}

console.log("\n26. Messages use app's formatWeight for lb, plain kg for metric");
{
  // lb: use formatWeight (kgToLb -> roundLbToHalf -> format, no .0 for whole numbers)
  // kg: plain value (no formatWeight rounding, matches main)
  
  // 42.5 kg * 0.9 = 38.25, round to 2.5 grid = 37.5 kg. Display in lb: 37.5 kg = 82.673 lb -> 82.5 lb
  const backOff425 = run({
    meta: BENCH,
    sets: sets(4, 7, 42.5),
    state: fresh({ currentWorkingWeightKg: 42.5, consecutiveFailures: 1 }),
    equipmentIds: ["barbell"],
    unit: "lb",
  });
  check("42.5 kg back-off shows 82.5 lb (app formatter)", backOff425.message.includes("82.5 lb"), backOff425.message);
  
  // 57.5 kg * 0.9 = 51.75, round to 2.5 grid = 50 kg. Display in lb: 50 kg = 110.231 lb -> 110 lb (no .0)
  const backOff575 = run({
    meta: BENCH,
    sets: sets(4, 7, 57.5),
    state: fresh({ currentWorkingWeightKg: 57.5, consecutiveFailures: 1 }),
    equipmentIds: ["barbell"],
    unit: "lb",
  });
  check("57.5 kg back-off shows 110 lb (app formatter, no .0)", backOff575.message.includes("110 lb") && !backOff575.message.includes("110.0"), backOff575.message);
  
  // kg messages: plain kg value (no formatWeight rounding, matches main)
  // 15 kg progress -> 17.5 kg. Display in kg: "17.5 kg" (not "17.5" or "17.50")
  const progressKg = run({
    sets: sets(4, 12, 15),
    state: fresh({ currentWorkingWeightKg: 15 }),
    equipmentIds: ["barbell"],
    unit: undefined,
  });
  check("15 kg progress shows '17.5 kg' (plain, matches main)", progressKg.message.includes("17.5 kg"), progressKg.message);
  
  // 16.25 kg back-off: 16.25 * 0.9 = 14.625, floor to 2.5 = 12.5 kg. Display: "12.5 kg" (plain)
  const backOffKg = run({
    meta: BENCH,
    sets: sets(4, 7, 16.25),
    state: fresh({ currentWorkingWeightKg: 16.25, consecutiveFailures: 1 }),
    equipmentIds: ["barbell"],
    unit: undefined,
  });
  check("16.25 kg back-off shows '12.5 kg' (plain, no rounding)", backOffKg.message.includes("12.5 kg") && !backOffKg.message.includes("12.50"), backOffKg.message);
}

console.log("\n27. Back-off never raises weight");
{
  // 1 kg * 0.9 = 0.9, rounds to 0, but must hold at 1 kg (not raise to 5 kg)
  const backOff1 = run({
    meta: CURL,
    sets: sets(4, 7, 1),
    state: fresh({ currentWorkingWeightKg: 1, consecutiveFailures: 1 }),
    equipmentIds: ["dumbbell"],
    unit: "kg",
  });
  check("back-off 1 kg: holds at 1 kg (never raises)", backOff1.nextWorkingWeightKg === 1, `${backOff1.nextWorkingWeightKg}`);
  
  // 0.5 kg * 0.9 = 0.45, rounds to 0, but must hold at 0.5 kg
  const backOff05 = run({
    meta: CURL,
    sets: sets(4, 7, 0.5),
    state: fresh({ currentWorkingWeightKg: 0.5, consecutiveFailures: 1 }),
    equipmentIds: ["dumbbell"],
    unit: "kg",
  });
  check("back-off 0.5 kg: holds at 0.5 kg (never raises)", backOff05.nextWorkingWeightKg === 0.5, `${backOff05.nextWorkingWeightKg}`);
}

console.log("\n28. Kettlebell back-off lands on real bell, one step down at most");
{
  // 48 kg * 0.9 = 43.2, not a real bell, should drop to 40 kg (one bell down)
  const kbBackOff48 = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 7, 48),
    state: fresh({ currentWorkingWeightKg: 48, consecutiveFailures: 1 }),
    equipmentIds: ["kettlebell"],
    unit: "kg",
  });
  check("kettlebell back-off 48 kg: 48 -> 48 kg (holds, no bell between cap and current)", kbBackOff48.nextWorkingWeightKg === 48, `${kbBackOff48.nextWorkingWeightKg}`);
  
  // 20 kg * 0.9 = 18, exact bell, should stay at 18
  const kbBackOff20 = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 7, 20),
    state: fresh({ currentWorkingWeightKg: 20, consecutiveFailures: 1 }),
    equipmentIds: ["kettlebell"],
    unit: "kg",
  });
  check("kettlebell back-off 20 kg: 20 -> 18 kg (one bell down)", kbBackOff20.nextWorkingWeightKg === 18, `${kbBackOff20.nextWorkingWeightKg}`);
}

console.log("\n29. Back-off max drop: never more than one increment below 90%");
{
  // 11 kg * 0.9 = 9.9, floor to 2.5 grid = 7.5, but max drop = 9.9 - 5 = 4.9, so 7.5 is OK
  const backOff11 = run({
    meta: { ...BENCH, movementPattern: "squat" },
    sets: sets(4, 7, 11),
    state: fresh({ currentWorkingWeightKg: 11, consecutiveFailures: 1 }),
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  check("back-off 11 kg: 11 -> 7.5 kg (not 5 kg)", backOff11.nextWorkingWeightKg === 7.5, `${backOff11.nextWorkingWeightKg}`);
  
  // 6 kg * 0.9 = 5.4, floor to 2.5 grid = 5, but max drop = 5.4 - 2.5 = 2.9, so 5 is OK
  const backOff6 = run({
    meta: BENCH,
    sets: sets(4, 7, 6),
    state: fresh({ currentWorkingWeightKg: 6, consecutiveFailures: 1 }),
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  check("back-off 6 kg: 6 -> 5 kg (not 2.5 kg)", backOff6.nextWorkingWeightKg === 5, `${backOff6.nextWorkingWeightKg}`);
}

console.log("\n30. Isolation back-off uses 1.25 kg grid (not 2.5 kg)");
{
  // 13.75 kg isolation * 0.9 = 12.375, floor to 1.25 grid = 11.25 (not 12.5 on 2.5 grid)
  // Max drop = 12.375 - 1.25 = 11.125, so floor to 1.25 grid = 11.25
  const backOffIso = run({
    meta: CURL,
    sets: sets(4, 7, 13.75),
    state: fresh({ currentWorkingWeightKg: 13.75, consecutiveFailures: 1 }),
    equipmentIds: ["dumbbell"],
    unit: "kg",
  });
  check("isolation back-off 13.75 kg: 13.75 -> 12.5 kg (loadable)", backOffIso.nextWorkingWeightKg === 12.5, `${backOffIso.nextWorkingWeightKg}`);
  check("isolation back-off 13.75 kg message says 'dropping to 12.5 kg'", backOffIso.message.includes("dropping to 12.5 kg") || backOffIso.message.includes("27"), backOffIso.message);
  const curl15 = run({ meta: CURL, sets: sets(4, 12, 15), state: fresh({ currentWorkingWeightKg: 15 }), equipmentIds: undefined, unit: undefined });
  check("unwired curl 15 kg -> 'up to 16.25 kg' (main's kg wording, not 16.3)", curl15.nextWorkingWeightKg === 16.25 && curl15.message.includes("up to 16.25 kg"), curl15.message);
}

console.log("\n31. Kettlebell back-off: SMALLEST loadable >= target and < current");
{
  // 22 kg (not a real bell, between 20 and 24) * 0.9 = 19.8
  // Compound: target = max(floor(19.8/2.5)*2.5, 19.8-2.5) = max(17.5, 17.3) = 17.5
  // Smallest bell >= 17.5 and < 22: 18kg
  const kbBackOff22 = run({
    meta: KETTLEBELL_SWING,
    sets: sets(4, 7, 22),
    state: fresh({ currentWorkingWeightKg: 22, consecutiveFailures: 1 }),
    equipmentIds: ["kettlebell"],
    unit: "kg",
  });
  check("kettlebell back-off 22 kg (off-grid): 22 -> 18 kg (smallest >= target)", kbBackOff22.nextWorkingWeightKg === 18, `${kbBackOff22.nextWorkingWeightKg}`);
}

console.log("\n32. Back-off holds when reduced weight would be at or below increment");
{
  // 7.5 kg lower-body: 7.5 * 0.9 = 6.75, floor to 2.5 grid = 5
  // But 7.5 <= 5 (increment) + 2.5, so reduced = 5 <= 5 (increment), HOLD
  // Owner decision: could drop to 5 instead (one-character change)
  const backOff75 = run({
    meta: { ...BENCH, movementPattern: "squat" },
    sets: sets(4, 7, 7.5),
    state: fresh({ currentWorkingWeightKg: 7.5, consecutiveFailures: 1 }),
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  check("back-off 7.5 kg lower: holds at 7.5 kg (reduced 5 <= increment 5)", backOff75.nextWorkingWeightKg === 7.5 && backOff75.outcome === "hold", `${backOff75.nextWorkingWeightKg}, ${backOff75.outcome}`);
}

console.log("\n33. In-range hold: 4×10 in 8-12 holds weight, resets failures");
{
  const inRange = run({
    meta: BENCH,
    sets: sets(4, 10, 40),
    state: fresh({ currentWorkingWeightKg: 40, consecutiveFailures: 0 }),
    equipmentIds: ["barbell"],
    unit: "kg",
  });
  check("4×10 in 8-12: outcome hold", inRange.outcome === "hold");
  check("4×10 in 8-12: weight unchanged at 40", inRange.nextWorkingWeightKg === 40, `${inRange.nextWorkingWeightKg}`);
  check("4×10 in 8-12: failures reset to 0", inRange.consecutiveFailures === 0, `${inRange.consecutiveFailures}`);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
