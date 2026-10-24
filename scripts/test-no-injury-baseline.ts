/**
 * No-Injury Baseline Test
 * 
 * Ensures that plans for users with NO injuries are identical to origin/main.
 * Uses SHA256 hashes of plan output for compact storage.
 * 
 *   npm run test:no-injury-baseline
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import type { Database } from "../src/lib/database.types";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

interface CompactBaseline {
  planHash: string;
  swapsHash?: string;
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
}

const baseline: Record<string, CompactBaseline> = JSON.parse(
  readFileSync("scripts/fixtures/no-injury-baseline-compact.json", "utf8")
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
    bmi: 22,
    hasAllEquipment: profile.hasAllEquipment,
    equipmentIds: profile.equipmentIds,
    preferredSessionMinutes: profile.sessionMinutes,
    currentInjuryRegions: [],
    anyKneeInjury: false,
    catalogue,
  };
  
  const plan = generateProgram(input);
  const planJson = JSON.stringify(plan);
  const planHash = createHash("sha256").update(planJson).digest("hex");
  
  check(
    "Plan matches main baseline",
    planHash === baselineData.planHash,
    planHash !== baselineData.planHash 
      ? `Hash mismatch: expected ${baselineData.planHash.substring(0, 16)}..., got ${planHash.substring(0, 16)}...`
      : undefined
  );
}

console.log("\n" + "─".repeat(60));
console.log(`Summary: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
