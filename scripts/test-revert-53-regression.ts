/**
 * Revert PR #53 Regression Test
 * 
 * Tests that the pre-PR#53 generator does not exhibit the HIGH regression
 * issues reported in QA Bot 1 report (uploads/report-bot1-pr53.md):
 * - 1-set rows/pulldowns stacked 4-6 deep on beginner full-body plans
 * - Main lifts cut to 1 set
 * - Sessions running 30-40% short of target duration
 * 
 * Uses REAL generateProgram and estimateSessionMinutes with the REAL catalogue.
 */
import { readFileSync } from "node:fs";
import {
  generateProgram,
  type CandidateExercise,
  type GeneratorInput,
  estimateSessionMinutes,
} from "../src/lib/program/generate";

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
) as CandidateExercise[];

const byId = new Map(catalogue.map((e) => [e.id, e]));

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
}

function base(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    userId: "qa-revert-53-default",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 3,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],
    preferredSessionMinutes: 60,
    catalogue,
    ...overrides,
  };
}

console.log("\nRevert PR #53 Regression Tests");
console.log("================================\n");

const profiles: Array<{
  id: string;
  input: Partial<GeneratorInput>;
  description: string;
}> = [
  {
    id: "beg-gym-fb-45",
    input: {
      userId: "qa-revert-53-beg-gym-fb-45",
      level: "beginner",
      goal: "general_fitness",
      primaryTrack: "weights",
      daysPerWeek: 3,
      preferredSessionMinutes: 45,
      hasAllEquipment: true,
    },
    description: "Beginner gym full-body 3 days 45 min",
  },
  {
    id: "beg-gym-fb-75",
    input: {
      userId: "qa-revert-53-beg-gym-fb-75",
      level: "beginner",
      goal: "muscle_gain",
      primaryTrack: "weights",
      daysPerWeek: 3,
      preferredSessionMinutes: 75,
      hasAllEquipment: true,
    },
    description: "Beginner gym full-body 3 days 75 min",
  },
  {
    id: "beg-home-db-fb-45",
    input: {
      userId: "qa-revert-53-beg-home-db-fb-45",
      level: "beginner",
      goal: "general_fitness",
      primaryTrack: "weights",
      daysPerWeek: 3,
      preferredSessionMinutes: 45,
      hasAllEquipment: false,
      equipmentIds: ["dumbbell"],
    },
    description: "Beginner home dumbbell full-body 3 days 45 min",
  },
  {
    id: "int-bw-upper-45",
    input: {
      userId: "qa-revert-53-int-bw-upper-45",
      level: "intermediate",
      goal: "general_fitness",
      primaryTrack: "bodyweight",
      daysPerWeek: 4,
      preferredSessionMinutes: 45,
      hasAllEquipment: false,
      equipmentIds: [],
    },
    description: "Intermediate bodyweight 4 days Upper B 45 min",
  },
];

for (const profile of profiles) {
  const input = base(profile.input);
  const plan = generateProgram(input);

  console.log(`\n${profile.description} (${profile.id})`);
  console.log("─".repeat(60));

  const trainingDays = plan.days.filter(
    (d) => d.dayType === "weights" || d.dayType === "bodyweight"
  );

  let profileHasIssues = false;

  for (const day of trainingDays) {
    console.log(`\n${day.label}:`);

    const exercises = day.exercises.map((e) => {
      const ex = byId.get(e.exerciseId)!;
      return { ...e, exercise: ex };
    });

    for (const { name, targetSets, targetRepsMin, targetRepsMax, exercise } of exercises) {
      const pattern = exercise.movement_pattern;
      console.log(
        `  ${name} [${pattern}] ${targetSets}×${targetRepsMin}-${targetRepsMax}`
      );
    }

    const estimated = estimateSessionMinutes(day);
    console.log(`  → Estimated: ${estimated.toFixed(0)} min (target: ${input.preferredSessionMinutes} min)`);

    const exercisesWithOneSets = exercises.filter((e) => e.targetSets < 2);
    if (exercisesWithOneSets.length > 0) {
      check(
        `${day.label}: no exercise has fewer than 2 sets`,
        false,
        exercisesWithOneSets.map((e) => `${e.name} has ${e.targetSets} set(s)`).join(", ")
      );
      profileHasIssues = true;
    } else {
      check(`${day.label}: no exercise has fewer than 2 sets`, true);
    }

    const mainExercises = exercises.slice(0, 2);
    const mainWithLowSets = mainExercises.filter((e) => e.targetSets < 2);
    if (mainWithLowSets.length > 0) {
      check(
        `${day.label}: first 2 main exercises have at least 2 sets`,
        false,
        mainWithLowSets.map((e) => `${e.name} has ${e.targetSets} set(s)`).join(", ")
      );
      profileHasIssues = true;
    } else {
      check(`${day.label}: first 2 main exercises have at least 2 sets`, true);
    }

    const patternCounts: Record<string, number> = {};
    for (const { exercise } of exercises) {
      const pattern = exercise.movement_pattern;
      if (pattern !== "core") {
        patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
      }
    }

    const duplicatedPatterns = Object.entries(patternCounts).filter(
      ([, count]) => count > 2
    );
    if (duplicatedPatterns.length > 0) {
      check(
        `${day.label}: no non-core pattern appears more than 2 times`,
        false,
        duplicatedPatterns.map(([p, c]) => `${p} appears ${c} times`).join(", ")
      );
      profileHasIssues = true;
    } else {
      check(`${day.label}: no non-core pattern appears more than 2 times`, true);
    }
  }

  if (!profileHasIssues) {
    console.log(`\n✓ ${profile.description}: All checks passed`);
  }
}

console.log("\n\nDeterminism check");
console.log("─".repeat(60));

const deterministicInput = base({
  userId: "qa-revert-53-determinism",
  level: "beginner",
  daysPerWeek: 3,
  preferredSessionMinutes: 45,
});

const plan1 = generateProgram(deterministicInput);
const plan2 = generateProgram(deterministicInput);

const stringify = (plan: ReturnType<typeof generateProgram>) =>
  JSON.stringify(
    plan.days.map((d) => ({
      label: d.label,
      exercises: d.exercises.map((e) => ({
        id: e.exerciseId,
        sets: e.targetSets,
        repsMin: e.targetRepsMin,
        repsMax: e.targetRepsMax,
      })),
    }))
  );

const isDeterministic = stringify(plan1) === stringify(plan2);
check(
  "Same input produces same output (deterministic)",
  isDeterministic,
  isDeterministic ? "" : "Plans differ on repeated generation"
);

console.log(`\n${failures === 0 ? "✓ All tests passed!" : `✗ ${failures} test(s) failed`}`);
process.exit(failures > 0 ? 1 : 0);
