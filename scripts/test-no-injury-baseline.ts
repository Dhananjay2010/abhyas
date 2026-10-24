/**
 * No-Injury Baseline Test
 * 
 * Ensures that plans and swaps for users with NO injuries are identical to main branch.
 * The baseline was generated from origin/main and committed to the repository.
 * 
 * QA finding: 2,268/3,888 no-injury plans differed from main before this fix.
 * 
 *   npm run test:no-injury-baseline
 */
import { readFileSync } from "node:fs";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import type { Database } from "../src/lib/database.types";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

interface BaselinePlan {
  profile: {
    goal: string;
    level: string;
    track: string;
    daysPerWeek: number;
    hasAllEquipment: boolean;
    age: number;
    sessionMinutes: number;
    equipmentIds: string[];
  };
  plan: {
    splitType: string;
    days: Array<{
      dayType: string;
      focus: string | null;
      exercises: Array<{
        exerciseId: string;
        slug: string;
        targetSets?: number;
        targetRepsMin?: number;
        targetRepsMax?: number;
      }>;
    }>;
  };
}

const baseline: Record<string, BaselinePlan> = JSON.parse(
  readFileSync("scripts/fixtures/no-injury-baseline.json", "utf8")
);

let passed = 0;
let failed = 0;

function check(desc: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${desc}`);
    passed++;
  } else {
    console.log(`  ✗ ${desc}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function isFitnessGoal(value: string): value is Database["public"]["Enums"]["fitness_goal"] {
  return value === "general_fitness" || value === "muscle_gain" || value === "strength" || value === "endurance";
}

function isFitnessLevel(value: string): value is Database["public"]["Enums"]["fitness_level"] {
  return value === "beginner" || value === "intermediate" || value === "expert";
}

function isTrackType(value: string): value is Database["public"]["Enums"]["track_type"] {
  return value === "weights" || value === "bodyweight";
}

console.log("No-Injury Baseline Test");
console.log("─".repeat(60));
console.log(`Loaded ${Object.keys(baseline).length} baseline plans from main`);
console.log();

for (const [userId, baselineData] of Object.entries(baseline)) {
  const profile = baselineData.profile;
  console.log(`\n${userId}: ${profile.goal} ${profile.level} ${profile.track} ${profile.daysPerWeek}d`);
  
  if (!isFitnessGoal(profile.goal)) {
    console.log(`  ✗ Invalid goal: ${profile.goal}`);
    failed++;
    continue;
  }
  if (!isFitnessLevel(profile.level)) {
    console.log(`  ✗ Invalid level: ${profile.level}`);
    failed++;
    continue;
  }
  if (!isTrackType(profile.track)) {
    console.log(`  ✗ Invalid track: ${profile.track}`);
    failed++;
    continue;
  }
  
  const input: GeneratorInput = {
    userId,
    blockNumber: 1,
    goal: profile.goal,
    level: profile.level,
    primaryTrack: profile.track,
    daysPerWeek: profile.daysPerWeek,
    yogaDaysPerWeek: 0,
    age: profile.age,
    bmi: 23,
    hasAllEquipment: profile.hasAllEquipment,
    equipmentIds: profile.equipmentIds,
    currentInjuryRegions: [],
    anyKneeInjury: false,
    preferredSessionMinutes: profile.sessionMinutes,
    catalogue,
  };
  
  const plan = generateProgram(input);
  
  // Check split type matches
  check(
    `Split type: ${plan.splitType}`,
    plan.splitType === baselineData.plan.splitType,
    plan.splitType !== baselineData.plan.splitType ? `Expected ${baselineData.plan.splitType}` : undefined
  );
  
  // Check number of days matches
  check(
    `Days: ${plan.days.length}`,
    plan.days.length === baselineData.plan.days.length,
    plan.days.length !== baselineData.plan.days.length ? `Expected ${baselineData.plan.days.length}` : undefined
  );
  
  // Check each day
  for (let dayIdx = 0; dayIdx < Math.min(plan.days.length, baselineData.plan.days.length); dayIdx++) {
    const day = plan.days[dayIdx];
    const baselineDay = baselineData.plan.days[dayIdx];
    
    // Check day type and focus
    const dayMatch = day.dayType === baselineDay.dayType && day.focus === baselineDay.focus;
    check(
      `Day ${dayIdx + 1}: ${day.dayType} ${day.focus || 'N/A'}`,
      dayMatch,
      !dayMatch ? `Expected ${baselineDay.dayType} ${baselineDay.focus || 'N/A'}` : undefined
    );
    
    // Check exercise count
    check(
      `Day ${dayIdx + 1} exercises: ${day.exercises.length}`,
      day.exercises.length === baselineDay.exercises.length,
      day.exercises.length !== baselineDay.exercises.length ? `Expected ${baselineDay.exercises.length}` : undefined
    );
    
    // Check each exercise
    for (let exIdx = 0; exIdx < Math.min(day.exercises.length, baselineDay.exercises.length); exIdx++) {
      const ex = day.exercises[exIdx];
      const baselineEx = baselineDay.exercises[exIdx];
      const catalogueEx = catalogue.find(e => e.id === ex.exerciseId);
      
      const exMatch = ex.exerciseId === baselineEx.exerciseId;
      check(
        `Day ${dayIdx + 1} Ex ${exIdx + 1}: ${catalogueEx?.slug || ex.exerciseId}`,
        exMatch,
        !exMatch ? `Expected ${baselineEx.slug} [${baselineEx.exerciseId}]` : undefined
      );
      
      // Check sets/reps match
      const setsMatch = ex.targetSets === baselineEx.targetSets;
      const repsMatch = ex.targetRepsMin === baselineEx.targetRepsMin && ex.targetRepsMax === baselineEx.targetRepsMax;
      
      if (!setsMatch || !repsMatch) {
        check(
          `Day ${dayIdx + 1} Ex ${exIdx + 1} prescription`,
          false,
          `Expected ${baselineEx.targetSets}×${baselineEx.targetRepsMin}-${baselineEx.targetRepsMax}, got ${ex.targetSets}×${ex.targetRepsMin}-${ex.targetRepsMax}`
        );
      }
    }
  }
}

console.log("\n" + "─".repeat(60));
console.log(`Summary: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
