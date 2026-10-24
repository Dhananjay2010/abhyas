#!/usr/bin/env npx tsx
/**
 * Generate m3-baseline-no-injury.json from origin/main catalogue.
 * Uses git worktree to fetch main's code and catalogue without git calls at test time.
 * Full baseline with many profiles to detect any regression in no-injury plans/swaps.
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";

interface CandidateExercise {
  id: string;
  slug: string;
  name: string;
  movement_pattern: string;
  mechanic: string;
  metric: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  equipment_ids: string[];
  level_min: string;
  contraindicated_regions: string[];
  impact: string;
  spinal_load: string;
  tracks: string[];
  default_rest_seconds: number;
  category: string;
}

interface GeneratorInput {
  userId: string;
  blockNumber: number;
  goal: string;
  level: string;
  primaryTrack: string;
  daysPerWeek: number;
  yogaDaysPerWeek: number;
  age: number;
  bmi: number;
  hasAllEquipment: boolean;
  equipmentIds: string[];
  currentInjuryRegions: string[];
  preferredSessionMinutes: number;
  catalogue: CandidateExercise[];
}

interface AlternativesContext {
  level: string;
  availableEquipment: Set<string> | null;
  injuryRegions: string[];
  scoreFn: (e: CandidateExercise) => number;
  tieBreakFn: (s: string) => number;
}

interface DayExercise {
  exerciseId: string;
  [key: string]: unknown;
}

interface Day {
  dayType: string;
  exercises: DayExercise[];
}

interface GeneratedProgram {
  days: Day[];
}

interface ProfileSnapshot {
  userId: string;
  days: Array<{
    dayType: string;
    exercises: string[]; 
    swaps: Record<string, string[]>;
  }>;
}

interface Baseline {
  profiles: ProfileSnapshot[];
  generatedAt: string;
  mainCommit: string;
}

const worktreePath = join(process.cwd(), ".worktree-main-baseline");

async function generateBaseline() {
  console.log("\n1. Setting up git worktree for origin/main...");
  if (existsSync(worktreePath)) {
    console.log("  Removing existing worktree...");
    try {
      execSync(`git worktree remove ${worktreePath} --force`, { cwd: process.cwd(), stdio: "pipe" });
    } catch {
      rmSync(worktreePath, { recursive: true, force: true });
    }
  }

  try {
    execSync(`git worktree add ${worktreePath} origin/main`, { cwd: process.cwd(), stdio: "pipe" });
    console.log("  Worktree created");
  } catch (err) {
    console.error("  Failed to create worktree:", err);
    process.exit(1);
  }

  try {
    console.log("\n2. Loading main's catalogue fixture...");
    const mainCataloguePath = join(worktreePath, "scripts/fixtures/catalogue.json");
    const mainCatalogue = JSON.parse(readFileSync(mainCataloguePath, "utf-8")) as CandidateExercise[];
    console.log(`  Loaded ${mainCatalogue.length} exercises from main`);

    console.log("\n3. Getting main commit SHA...");
    const mainCommit = execSync("git rev-parse origin/main", { cwd: process.cwd(), encoding: "utf-8" }).trim();
    console.log(`  Main commit: ${mainCommit.slice(0, 8)}`);

    console.log("\n4. Importing main's generator and alternatives modules...");
    
    type GenerateFunction = (input: GeneratorInput) => GeneratedProgram;
    type RankAlternativesFunction = (
      current: CandidateExercise,
      pool: CandidateExercise[],
      ctx: AlternativesContext
    ) => CandidateExercise[];
    type HashStringFunction = (s: string) => number;

    const mainGeneratePath = join(worktreePath, "src/lib/program/generate.ts");
    const mainAlternativesPath = join(worktreePath, "src/lib/program/alternatives.ts");
    
    const generateModule = await import(mainGeneratePath);
    const alternativesModule = await import(mainAlternativesPath);
    
    const generateProgram = generateModule.generateProgram as GenerateFunction;
    const rankAlternatives = alternativesModule.rankAlternatives as RankAlternativesFunction;
    const hashString = generateModule.hashString as HashStringFunction;

  console.log("\n5. Generating baseline for diverse no-injury profiles...");
  
  const profiles: GeneratorInput[] = [
    {
      userId: "bw-2d-30m-beginner",
      blockNumber: 1,
      goal: "fat_loss",
      level: "beginner",
      primaryTrack: "bodyweight",
      daysPerWeek: 2,
      yogaDaysPerWeek: 0,
      age: 35,
      bmi: 28,
      hasAllEquipment: false,
      equipmentIds: ["bodyweight", "yoga_mat"],
      currentInjuryRegions: [],
      preferredSessionMinutes: 30,
      catalogue: mainCatalogue,
    },
    {
      userId: "bw-3d-45m-intermediate",
      blockNumber: 1,
      goal: "strength",
      level: "intermediate",
      primaryTrack: "bodyweight",
      daysPerWeek: 3,
      yogaDaysPerWeek: 1,
      age: 30,
      bmi: 22,
      hasAllEquipment: false,
      equipmentIds: ["bodyweight", "yoga_mat", "dip_bars", "resistance_band"],
      currentInjuryRegions: [],
      preferredSessionMinutes: 45,
      catalogue: mainCatalogue,
    },
    {
      userId: "bw-4d-60m-advanced",
      blockNumber: 1,
      goal: "muscle_gain",
      level: "expert",
      primaryTrack: "bodyweight",
      daysPerWeek: 4,
      yogaDaysPerWeek: 0,
      age: 28,
      bmi: 24,
      hasAllEquipment: false,
      equipmentIds: ["bodyweight", "yoga_mat", "dip_bars", "dumbbell", "resistance_band", "pull_up_bar"],
      currentInjuryRegions: [],
      preferredSessionMinutes: 60,
      catalogue: mainCatalogue,
    },
    {
      userId: "db-3d-45m-beginner",
      blockNumber: 1,
      goal: "fat_loss",
      level: "beginner",
      primaryTrack: "weights",
      daysPerWeek: 3,
      yogaDaysPerWeek: 0,
      age: 40,
      bmi: 27,
      hasAllEquipment: false,
      equipmentIds: ["bodyweight", "dumbbell", "yoga_mat"],
      currentInjuryRegions: [],
      preferredSessionMinutes: 45,
      catalogue: mainCatalogue,
    },
    {
      userId: "kb-4d-60m-intermediate",
      blockNumber: 1,
      goal: "strength",
      level: "intermediate",
      primaryTrack: "weights",
      daysPerWeek: 4,
      yogaDaysPerWeek: 0,
      age: 32,
      bmi: 23,
      hasAllEquipment: false,
      equipmentIds: ["bodyweight", "kettlebell", "yoga_mat", "dumbbell"],
      currentInjuryRegions: [],
      preferredSessionMinutes: 60,
      catalogue: mainCatalogue,
    },
    {
      userId: "bb-4d-60m-intermediate",
      blockNumber: 1,
      goal: "muscle_gain",
      level: "intermediate",
      primaryTrack: "weights",
      daysPerWeek: 4,
      yogaDaysPerWeek: 0,
      age: 28,
      bmi: 24,
      hasAllEquipment: false,
      equipmentIds: ["bodyweight", "barbell", "weight_rack", "bench"],
      currentInjuryRegions: [],
      preferredSessionMinutes: 60,
      catalogue: mainCatalogue,
    },
    {
      userId: "gym-5d-60m-advanced",
      blockNumber: 1,
      goal: "muscle_gain",
      level: "expert",
      primaryTrack: "weights",
      daysPerWeek: 5,
      yogaDaysPerWeek: 0,
      age: 26,
      bmi: 22,
      hasAllEquipment: true,
      equipmentIds: [],
      currentInjuryRegions: [],
      preferredSessionMinutes: 60,
      catalogue: mainCatalogue,
    },
    {
      userId: "gym-6d-75m-expert",
      blockNumber: 1,
      goal: "strength",
      level: "expert",
      primaryTrack: "weights",
      daysPerWeek: 6,
      yogaDaysPerWeek: 0,
      age: 30,
      bmi: 25,
      hasAllEquipment: true,
      equipmentIds: [],
      currentInjuryRegions: [],
      preferredSessionMinutes: 75,
      catalogue: mainCatalogue,
    },
  ];

  const snapshots: ProfileSnapshot[] = [];

  for (const input of profiles) {
    console.log(`  Generating ${input.userId}...`);
    const plan = generateProgram(input);

    const profileSnapshot: ProfileSnapshot = {
      userId: input.userId,
      days: [],
    };

    for (const day of plan.days) {
      const exerciseSlugs: string[] = [];
      const swaps: Record<string, string[]> = {};

      for (const ex of day.exercises) {
        const exercise = mainCatalogue.find((e) => e.id === ex.exerciseId);
        if (exercise) {
          exerciseSlugs.push(exercise.slug);

          const ctx: AlternativesContext = {
            level: input.level,
            availableEquipment: input.hasAllEquipment ? null : new Set(input.equipmentIds),
            injuryRegions: [],
            scoreFn: () => 1,
            tieBreakFn: (s: string) => hashString(s),
          };

          const swapCandidates = rankAlternatives(exercise, mainCatalogue, ctx);
          swaps[exercise.slug] = swapCandidates.slice(0, 5).map((s) => s.slug);
        }
      }

      profileSnapshot.days.push({
        dayType: day.dayType,
        exercises: exerciseSlugs,
        swaps,
      });
    }

    snapshots.push(profileSnapshot);
  }

  console.log("\n6. Writing baseline...");
  const baseline: Baseline = {
    profiles: snapshots,
    generatedAt: new Date().toISOString(),
    mainCommit,
  };

  const outputPath = join(process.cwd(), "scripts/fixtures/m3-baseline-no-injury.json");
  writeFileSync(outputPath, JSON.stringify(baseline, null, 2) + "\n");

  let totalExercises = 0;
  let totalSwaps = 0;
  for (const profile of snapshots) {
    for (const day of profile.days) {
      totalExercises += day.exercises.length;
      totalSwaps += Object.values(day.swaps).flat().length;
    }
  }

  console.log(`  ✓ Baseline written: ${snapshots.length} profiles, ${totalExercises} exercises, ${totalSwaps} swaps`);
  } finally {
    console.log("\n7. Cleaning up worktree...");
    try {
      execSync(`git worktree remove ${worktreePath} --force`, { cwd: process.cwd(), stdio: "pipe" });
    } catch {
      rmSync(worktreePath, { recursive: true, force: true });
    }
    console.log("  Worktree removed\n");
  }
}

generateBaseline().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
