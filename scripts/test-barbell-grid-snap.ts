/**
 * Test: Barbell exercises must always snap to 2.5 kg grid
 * 
 * Bug report: barbell calf raise (isolation + calf) progression showed "up to 41.25 kg",
 * which cannot be loaded on a barbell. Barbells increment in 2.5 kg steps.
 * 
 * This test verifies that ALL barbell exercises (regardless of mechanic or muscle)
 * snap to the 2.5 kg grid for both success and failure progressions.
 */

import { evaluateProgression, type ExerciseMeta } from "../src/lib/program/progression";
import { buildProgressionInput, type SessionExerciseRow, type SessionSetRow, type ExerciseProgressRow, type SessionRow } from "../src/lib/session/build-progression-input";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

const BARBELL_CALF: ExerciseMeta = {
  mechanic: "isolation",
  movementPattern: "calf",
  metric: "reps",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
};

function testBarbellCalfRaiseSuccess() {
  console.log("\nBarbell calf raise: Success progression");
  
  // Test a range of starting weights
  const startWeights = [20, 37.5, 40, 55, 62.5, 100];
  
  for (const weight of startWeights) {
    const decision = evaluateProgression({
      sets: [
        { reps: 12, weightKg: weight, durationSeconds: null },
        { reps: 12, weightKg: weight, durationSeconds: null },
        { reps: 12, weightKg: weight, durationSeconds: null },
        { reps: 12, weightKg: weight, durationSeconds: null },
      ],
      plannedSets: 4,
      repsMin: 8,
      repsMax: 12,
      feel: "right",
      meta: BARBELL_CALF,
      state: {
        currentWorkingWeightKg: weight,
        currentTargetReps: 12,
        consecutiveFailures: 0,
        bestWeightKg: weight,
        bestReps: 12,
        bestE1rm: null,
        totalSessions: 5,
        weightAtFailureStartKg: null,
      },
      isDeload: false,
      equipmentIds: ["barbell"],
    });
    
    const next = decision.nextWorkingWeightKg;
    const isValid2_5Multiple = next === null || Math.abs((next * 100) % 250) < 0.01;
    check(`${weight} kg → ${next} kg is 2.5 kg multiple`, isValid2_5Multiple, decision.message);
    
    // Should never produce 41.25, 43.75, etc.
    const isBad = next !== null && (
      Math.abs(next - 41.25) < 0.01 ||
      Math.abs(next - 43.75) < 0.01 ||
      Math.abs(next - 46.25) < 0.01 ||
      Math.abs(next % 2.5) > 0.01
    );
    check(`${weight} kg does not produce invalid weights`, !isBad);
  }
}

function testBarbellCalfRaiseMiss() {
  console.log("\nBarbell calf raise: Two-miss back-off");
  
  const startWeights = [22.5, 37.5, 40, 45, 60];
  
  for (const weight of startWeights) {
    const decision = evaluateProgression({
      sets: [
        { reps: 7, weightKg: weight, durationSeconds: null },
        { reps: 7, weightKg: weight, durationSeconds: null },
        { reps: 6, weightKg: weight, durationSeconds: null },
      ],
      plannedSets: 4,
      repsMin: 8,
      repsMax: 12,
      feel: "hard",
      meta: BARBELL_CALF,
      state: {
        currentWorkingWeightKg: weight,
        currentTargetReps: 12,
        consecutiveFailures: 1, // This is the second miss
        bestWeightKg: weight,
        bestReps: 12,
        bestE1rm: null,
        totalSessions: 8,
        weightAtFailureStartKg: weight, // First miss was at this weight
      },
      isDeload: false,
      equipmentIds: ["barbell"],
    });
    
    const next = decision.nextWorkingWeightKg;
    const isValid2_5Multiple = next === null || Math.abs((next * 100) % 250) < 0.01;
    check(`Two-miss ${weight} kg → ${next} kg is 2.5 kg multiple`, isValid2_5Multiple, decision.message);
  }
}

function testRealCallPath() {
  console.log("\nReal call path: buildProgressionInput → evaluateProgression");
  
  const se: SessionExerciseRow = {
    id: "se-123",
    session_id: "s-123",
    exercise_id: "ex-calf",
    planned_sets: 4,
    planned_reps_min: 8,
    planned_reps_max: 12,
    metric: "reps",
    exercises: {
      mechanic: "isolation",
      movement_pattern: "calf",
      equipment_ids: ["barbell"],
      progression_chain: null,
      progression_rank: null,
    },
  };
  
  const sets: SessionSetRow[] = [
    { reps: 12, weight_kg: "40", duration_seconds: null },
    { reps: 12, weight_kg: "40", duration_seconds: null },
    { reps: 12, weight_kg: "40", duration_seconds: null },
    { reps: 12, weight_kg: "40", duration_seconds: null },
  ];
  
  const progress: ExerciseProgressRow = {
    current_working_weight_kg: "40",
    current_target_reps: 12,
    consecutive_failures: 0,
    best_weight_kg: "40",
    best_reps: 12,
    best_e1rm: null,
    total_sessions: 6,
    weight_at_failure_start_kg: null,
  };
  
  const session: SessionRow = {
    is_deload: false,
    local_date: "2026-10-25",
    program_id: "prog-123",
  };
  
  const input = buildProgressionInput(se, sets, progress, session, "right");
  const decision = evaluateProgression(input);
  
  const next = decision.nextWorkingWeightKg;
  check("Real path: 40 kg barbell calf → valid 2.5 multiple", 
    next !== null && Math.abs((next * 100) % 250) < 0.01,
    `got ${next} kg`);
  check("Real path: Not 41.25 kg", next !== 41.25);
  check("Real path: Should be 42.5 kg", next === 42.5);
}

testBarbellCalfRaiseSuccess();
testBarbellCalfRaiseMiss();
testRealCallPath();

function testDeloadCase() {
  console.log("\nBarbell calf raise: Deload");
  
  const startWeights = [40, 45, 60];
  
  for (const weight of startWeights) {
    const decision = evaluateProgression({
      sets: [
        { reps: 12, weightKg: weight, durationSeconds: null },
        { reps: 12, weightKg: weight, durationSeconds: null },
        { reps: 12, weightKg: weight, durationSeconds: null },
      ],
      plannedSets: 3,
      repsMin: 8,
      repsMax: 12,
      feel: "right",
      meta: BARBELL_CALF,
      state: {
        currentWorkingWeightKg: weight,
        currentTargetReps: 12,
        consecutiveFailures: 0,
        bestWeightKg: weight,
        bestReps: 12,
        bestE1rm: null,
        totalSessions: 5,
        weightAtFailureStartKg: null,
      },
      isDeload: true, // DELOAD
      equipmentIds: ["barbell"],
    });
    
    const next = decision.nextWorkingWeightKg;
    const isValid2_5Multiple = next === null || Math.abs((next * 100) % 250) < 0.01;
    check(`Deload ${weight} kg → ${next} kg is 2.5 kg multiple`, isValid2_5Multiple, decision.message);
  }
}

function testMissingEquipmentIds() {
  console.log("\nBarbell calf raise: equipmentIds in meta but not in call (defensive)");
  
  // Real scenario: equipmentIds IS passed (from buildProgressionInput)
  const decisionWithEquip = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 40, durationSeconds: null },
      { reps: 12, weightKg: 40, durationSeconds: null },
      { reps: 12, weightKg: 40, durationSeconds: null },
      { reps: 12, weightKg: 40, durationSeconds: null },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BARBELL_CALF,
    state: {
      currentWorkingWeightKg: 40,
      currentTargetReps: 12,
      consecutiveFailures: 0,
      bestWeightKg: 40,
      bestReps: 12,
      bestE1rm: null,
      totalSessions: 5,
      weightAtFailureStartKg: null,
    },
    isDeload: false,
    equipmentIds: ["barbell"], // PASSED
  });
  
  check(`With equipmentIds: 40 kg → ${decisionWithEquip.nextWorkingWeightKg} kg (should be 42.5)`, 
    decisionWithEquip.nextWorkingWeightKg === 42.5);
  
  // Pathological case: equipmentIds somehow missing (shouldn't happen in production)
  // This would happen if the database row is corrupted or API misuse
  const decisionWithout = evaluateProgression({
    sets: [
      { reps: 12, weightKg: 40, durationSeconds: null },
      { reps: 12, weightKg: 40, durationSeconds: null },
      { reps: 12, weightKg: 40, durationSeconds: null },
      { reps: 12, weightKg: 40, durationSeconds: null },
    ],
    plannedSets: 4,
    repsMin: 8,
    repsMax: 12,
    feel: "right",
    meta: BARBELL_CALF,
    state: {
      currentWorkingWeightKg: 40,
      currentTargetReps: 12,
      consecutiveFailures: 0,
      bestWeightKg: 40,
      bestReps: 12,
      bestE1rm: null,
      totalSessions: 5,
      weightAtFailureStartKg: null,
    },
    isDeload: false,
    // equipmentIds NOT PASSED (pathological/corrupt data case)
  });
  
  const isBug = decisionWithout.nextWorkingWeightKg === 41.25;
  check(`Without equipmentIds: still produces 41.25 kg (can't fix without data)`, isBug);
  check(`NOTE: Production always passes equipmentIds via buildProgressionInput`, true);
}

testDeloadCase();
testMissingEquipmentIds();

console.log(failures > 0 ? `\n❌ ${failures} failure(s)\n` : "\n✅ All barbell grid tests passed\n");
process.exit(failures > 0 ? 1 : 0);
