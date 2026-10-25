/**
 * No-Injury Baseline Test (PR #73 Run 21)
 * 
 * Ensures that plans for users with NO injuries match origin/main 4866c750 baseline.
 * Uses SHA256 hashes of FULL plan JSON for complete verification.
 * 
 * Wider coverage:
 * - Equipment: full-gym, kettlebell, db_bench, bb_rack, bands, machines
 * - All 5 goals
 * - 2-6 days
 * - 30/75 min
 * - Ages 30, 55
 * - All 3 levels
 * 
 * Total: 1800 profiles (6 equipment × 5 goals × 3 levels × 5 days × 2 minutes × 2 ages)
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

interface BaselineEntry {
  userId: string;
  level: string;
  equipment: string;
  goal: string;
  days: number;
  minutes: number;
  age: number;
  sha256: string;
}

const baseline: BaselineEntry[] = JSON.parse(
  readFileSync("scripts/fixtures/baseline-no-injury-wide.json", "utf8")
);

let passed = 0;
let failed = 0;

function check(desc: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
  } else {
    console.log(`  ✗ ${desc}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

console.log("No-Injury Baseline Test");
console.log("─".repeat(60));
console.log(`Testing ${baseline.length} plan profiles from main 95724924\n`);

const EQUIPMENT_MAP: Record<string, { ids: string[]; hasAll: boolean; track: "weights" | "bodyweight" }> = {
  "full-gym": { ids: [], hasAll: true, track: "weights" },
  "kettlebell": { ids: ["kettlebell"], hasAll: false, track: "weights" },
  "db_bench": { ids: ["dumbbell", "flat_bench"], hasAll: false, track: "weights" },
  "bb_rack": { ids: ["barbell", "squat_rack"], hasAll: false, track: "weights" },
  "bands": { ids: ["resistance_band"], hasAll: false, track: "weights" },
  "machines": { ids: ["cable_machine", "leg_extension", "leg_curl"], hasAll: false, track: "weights" },
};

// Type guards
function isValidGoal(s: string): s is "general_fitness" | "muscle_gain" | "strength" | "fat_loss" | "flexibility_stress" {
  return ["general_fitness", "muscle_gain", "strength", "fat_loss", "flexibility_stress"].includes(s);
}

function isValidLevel(s: string): s is "beginner" | "intermediate" | "expert" {
  return ["beginner", "intermediate", "expert"].includes(s);
}

for (const entry of baseline) {
  const equipmentProfile = EQUIPMENT_MAP[entry.equipment];
  if (!equipmentProfile) {
    check(`${entry.userId}`, false, `Unknown equipment profile: ${entry.equipment}`);
    continue;
  }
  
  if (!isValidGoal(entry.goal) || !isValidLevel(entry.level)) {
    check(`${entry.userId}`, false, `Invalid goal or level: ${entry.goal}/${entry.level}`);
    continue;
  }
  
  const input: GeneratorInput = {
    userId: entry.userId,
    blockNumber: 1,
    goal: entry.goal,
    level: entry.level,
    primaryTrack: equipmentProfile.track,
    daysPerWeek: entry.days,
    yogaDaysPerWeek: 0,
    age: entry.age,
    bmi: null,
    hasAllEquipment: equipmentProfile.hasAll,
    equipmentIds: equipmentProfile.ids,
    preferredSessionMinutes: entry.minutes,
    currentInjuryRegions: [],
    anyKneeInjury: false,
    catalogue,
  };
  
  try {
    const plan = generateProgram(input);
    // Hash the FULL plan JSON (not just exercise IDs) for complete verification
    const canonical = JSON.stringify(plan);
    const planHash = createHash("sha256").update(canonical).digest("hex");
    
    check(
      `${entry.userId}`,
      planHash === entry.sha256,
      planHash !== entry.sha256 
        ? `Hash mismatch: expected ${entry.sha256.substring(0, 16)}..., got ${planHash.substring(0, 16)}...`
        : undefined
    );
  } catch (err) {
    check(`${entry.userId}`, false, `Error generating plan: ${err}`);
  }
}

console.log("\n" + "─".repeat(60));
console.log(`Summary: ${passed} passed, ${failed} failed`);

if (passed > 0) {
  console.log(`✓ ${passed} profiles match main baseline`);
}

if (failed > 0) {
  console.log(`✗ ${failed} profiles differ from main`);
  process.exit(1);
}
