/**
 * Test unified usedWeight rule across build-runner-init and evaluateProgression
 *
 *   npm run test:used-weight-rule
 */
import { buildRunnerInit } from "../src/lib/session/build-runner-init";
import { evaluateProgression } from "../src/lib/program/progression";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nUnified usedWeight rule: stored weight + unweighted session");
{
  // Scenario: User has stored added weight (10 kg for pull-ups) but logs an unweighted session.
  // This is treated as pure bodyweight progression (because logged weight is 0).
  const state = {
    currentWorkingWeightKg: 10,
    currentTargetReps: 12,
    consecutiveFailures: 0,
    bestWeightKg: 10,
    bestReps: 12,
    bestE1rm: 84,
    totalSessions: 3,
  };

  const meta = {
    mechanic: "compound" as const,
    movementPattern: "other" as const,
    metric: "reps" as const,
    isBodyweight: true,
    progressionChain: null,
    progressionRank: null,
    equipmentIds: ["pull_up_bar"],
  };

  // Logs 3 unweighted sets (null weights) at the progressed target
  const sets = [
    { reps: 12, weightKg: null, durationSeconds: null },
    { reps: 12, weightKg: null, durationSeconds: null },
    { reps: 12, weightKg: null, durationSeconds: null },
  ];

  const decision = evaluateProgression({
    sets,
    plannedSets: 3,
    repsMax: 12,
    feel: "right",
    meta,
    state,
    isDeload: false,
  });

  check("stored 10 kg + unweighted session: logs treat it as pure bodyweight, progresses reps",
    decision.outcome === "progressed" && decision.nextTargetReps === 14,
    `got ${decision.outcome}, nextTarget=${decision.nextTargetReps}, logged 0 kg = pure bodyweight`);
  
  check("stored 10 kg + unweighted session: keeps stored weight as capability record",
    decision.nextWorkingWeightKg === 10,
    `got ${decision.nextWorkingWeightKg}, stored weight preserved`);

  // Same scenario: if sets had weight, should progress weight instead of reps
  const weightedSets = [
    { reps: 12, weightKg: 10, durationSeconds: null },
    { reps: 12, weightKg: 10, durationSeconds: null },
    { reps: 12, weightKg: 10, durationSeconds: null },
  ];

  const weightedDecision = evaluateProgression({
    sets: weightedSets,
    plannedSets: 3,
    repsMax: 12,
    feel: "right",
    meta,
    state,
    isDeload: false,
  });

  check("stored 10 kg + weighted session at 10 kg: progresses weight to 11.25 kg",
    weightedDecision.outcome === "progressed" && weightedDecision.nextWorkingWeightKg === 11.25,
    `got ${weightedDecision.outcome}, next=${weightedDecision.nextWorkingWeightKg}`);
}

console.log("\nUnified usedWeight rule: build-runner-init consistency");
{
  // build-runner-init should use stored weight
  const rows = [
    {
      id: "se-1",
      metric: "reps" as const,
      planned_sets: 3,
      planned_reps_min: 8,
      planned_reps_max: 12,
      rest_seconds: 120,
      status: "planned" as const,
      feel: null,
      exercises: {
        id: "ex-1",
        name: "Pull-up",
        cue: null,
        equipment_ids: ["pull_up_bar"] as const,
        mechanic: "compound",
        movement_pattern: "other",
        primary_muscles: ["lats"] as const,
      },
      session_sets: [],
    },
  ];

  const progress = new Map([
    ["ex-1", { current_working_weight_kg: 10, current_target_reps: 12 }],
  ]);

  const exercises = buildRunnerInit(rows, progress, true, false);

  check("build-runner-init: uses stored weight (10 kg)",
    exercises[0].workingWeightKg === 10,
    `got ${exercises[0].workingWeightKg}`);
  
  // effectiveRepsMax should treat this as loaded (has added weight)
  check("build-runner-init: bodyweight with added weight uses planned max (not progressed)",
    exercises[0].repsMax === 12,
    `got ${exercises[0].repsMax}, should ignore progressed target when weight exists`);
}

console.log("\nUnified usedWeight rule: pure bodyweight (no stored weight)");
{
  const state = {
    currentWorkingWeightKg: null,
    currentTargetReps: 14,
    consecutiveFailures: 0,
    bestWeightKg: null,
    bestReps: 14,
    bestE1rm: null,
    totalSessions: 3,
  };

  const meta = {
    mechanic: "compound" as const,
    movementPattern: "other" as const,
    metric: "reps" as const,
    isBodyweight: true,
    progressionChain: null,
    progressionRank: null,
    equipmentIds: [] as string[],
  };

  const sets = [
    { reps: 14, weightKg: null, durationSeconds: null },
    { reps: 14, weightKg: null, durationSeconds: null },
    { reps: 14, weightKg: null, durationSeconds: null },
  ];

  const decision = evaluateProgression({
    sets,
    plannedSets: 3,
    repsMax: 12,
    feel: "right",
    meta,
    state,
    isDeload: false,
  });

  check("pure bodyweight (no stored weight): progresses when hitting progressed target",
    decision.outcome === "progressed",
    `got ${decision.outcome}`);
}

if (failures === 0) {
  console.log("\nALL CHECKS PASSED\n");
  process.exit(0);
} else {
  console.error(`\n${failures} CHECKS FAILED\n`);
  process.exit(1);
}
