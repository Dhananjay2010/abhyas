/**
 * No-Injury Baseline Test
 * 
 * Ensures that plans for users with NO injuries match origin/main baseline.
 * Uses SHA256 hashes of plan output for compact storage (1728 profiles, <200KB).
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

interface Baseline {
  plans: Record<string, string>;
  swaps?: Record<string, string>;
  metadata: {
    planCount: number;
    swapCount?: number;
    generatedFrom: string;
    generatedAt: string;
  };
}

const baseline: Baseline = JSON.parse(
  readFileSync("scripts/fixtures/no-injury-baseline-compact.json", "utf8")
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
console.log(`Testing ${baseline.metadata.planCount} plan profiles from main\n`);

// Parse profile IDs and test each one
for (const [profileId, expectedHash] of Object.entries(baseline.plans)) {
  // Parse ID: ge-b-we-none-3d-45m-a30-b23-blk1
  const parts = profileId.split("-");
  if (parts.length < 9) continue;
  
  const goalMap: Record<string, string> = {
    ge: "general_fitness",
    mu: "muscle_gain",
    st: "strength",
    en: "endurance",
    sr: "stress_relief"
  };
  
  const levelMap: Record<string, string> = { b: "beginner", i: "intermediate", e: "expert" };
  const trackMap: Record<string, string> = { we: "weights", bo: "bodyweight", yo: "yoga" };
  
  const goal = goalMap[parts[0]];
  const level = levelMap[parts[1]];
  const track = trackMap[parts[2]];
  const equipment = parts[3];
  const days = parseInt(parts[4].replace("d", ""));
  const minutes = parseInt(parts[5].replace("m", ""));
  const age = parseInt(parts[6].replace("a", ""));
  const bmi = parseInt(parts[7].replace("b", ""));
  const block = parseInt(parts[8].replace("blk", ""));
  
  if (!goal || !level || !track) continue;
  
  const equipmentIds = equipment === "none" ? [] : equipment === "full" ? [] : [equipment];
  const hasAllEquipment = equipment === "full";
  
  const input: GeneratorInput = {
    userId: profileId,
    blockNumber: block,
    goal: goal as Database["public"]["Enums"]["fitness_goal"],
    level: level as Database["public"]["Enums"]["fitness_level"],
    primaryTrack: track as Database["public"]["Enums"]["track_type"],
    daysPerWeek: days,
    yogaDaysPerWeek: track === "yoga" ? days : 0,
    age,
    bmi,
    hasAllEquipment,
    equipmentIds,
    preferredSessionMinutes: minutes,
    currentInjuryRegions: [],
    anyKneeInjury: false,
    catalogue,
  };
  
  try {
    const plan = generateProgram(input);
    const planJson = JSON.stringify(plan);
    const planHash = createHash("sha256").update(planJson).digest("hex");
    
    check(
      `${profileId}`,
      planHash === expectedHash,
      planHash !== expectedHash 
        ? `Hash mismatch: expected ${expectedHash.substring(0, 16)}..., got ${planHash.substring(0, 16)}...`
        : undefined
    );
  } catch (err) {
    check(`${profileId}`, false, `Error generating plan: ${err}`);
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
