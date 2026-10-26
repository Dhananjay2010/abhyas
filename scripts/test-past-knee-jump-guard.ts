/**
 * Coordinator decision (f): Jump guard test for past-knee users.
 * 
 * Verifies that only exercises with lower-body take-off or landing are banned
 * (jumps, hops, bounds, box/depth jumps, skater jumps, burpees, jump squats/lunges,
 * and jump rope where plyometric). All 16 upper-body plyos (plyo-push-up, clap push-ups,
 * medicine-ball slams and throws) are allowed for BOTH past and current knee.
 */

import { readFileSync } from "node:fs";
import {
  generateProgram,
  type CandidateExercise,
  type GeneratorInput,
} from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

const byId = new Map(catalogue.map(e => [e.id, e]));
const bySlug = new Map(catalogue.map(e => [e.slug, e]));

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

// 16 upper-body plyos that MUST be allowed for knee users  
// (chest-push-with-run-release excluded as it has "cardio" pattern, not picked for weights programs)
const UPPER_BODY_PLYOS = [
  "backward-medicine-ball-throw",
  "catch-and-overhead-throw",
  "chest-push-from-3-point-stance",
  "chest-push-multiple-response",
  "chest-push-single-response",
  "isometric-chest-squeezes",
  "medicine-ball-chest-pass",
  "medicine-ball-full-twist",
  "medicine-ball-scoop-throw",
  "overhead-slam",
  "plyo-push-up",
  "return-push-from-stance",
  "standing-two-arm-overhead-throw",
  "supine-chest-throw",
  "supine-one-arm-overhead-throw",
  "supine-two-arm-overhead-throw",
];

// Lower-body jumps that MUST be banned for knee users
const LOWER_BODY_JUMPS = [
  "bench-jump",
  "box-jump",
  "box-jump-down",
  "box-jump-up",
  "depth-jump",
  "double-leg-butt-kick",
  "dumbbell-seated-box-jump",
  "fast-skipping",
  "jump-rope",
  "jump-squat",
  "knee-tuck-jump",
  "lateral-bound",
  "rocket-jump",
  "scissors-jump",
  "single-leg-butt-kick",
  "skater-jump",
  "split-jump",
  "standing-long-jump",
  "star-jump",
  "vertical-swing",
];

async function main() {
console.log("Coordinator decision (f): Past-knee jump guard test");
console.log("─".repeat(60));

console.log("\n1. All 16 upper-body plyos ALLOWED for past knee");
{
  const input: GeneratorInput = {
    userId: "test-upper-plyo-past",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 22,
    hasAllEquipment: true,
    equipmentIds: [],
    anyKneeInjury: true,
    currentInjuryRegions: [],
    catalogue,
  };
  
  const { isEligible } = await import("../src/lib/program/generate");
  
  let banned = 0;
  const bannedSlugs: string[] = [];
  
  for (const slug of UPPER_BODY_PLYOS) {
    const ex = bySlug.get(slug);
    if (!ex) {
      check(`${slug} exists in catalogue`, false);
      continue;
    }
    
    if (!isEligible(ex, input)) {
      banned++;
      if (bannedSlugs.length < 5) bannedSlugs.push(slug);
    }
  }
  
  check(
    `All ${UPPER_BODY_PLYOS.length} upper-body plyos allowed for past knee`,
    banned === 0,
    banned > 0 ? `${banned} banned: ${bannedSlugs.join(", ")}` : ""
  );
}

console.log("\n2. All 16 upper-body plyos ALLOWED for current knee");
{
  const input: GeneratorInput = {
    userId: "test-upper-plyo-current",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 22,
    hasAllEquipment: true,
    equipmentIds: [],
    anyKneeInjury: true,
    currentInjuryRegions: ["knee"],
    catalogue,
  };
  
  const { isEligible } = await import("../src/lib/program/generate");
  
  let banned = 0;
  const bannedSlugs: string[] = [];
  
  for (const slug of UPPER_BODY_PLYOS) {
    const ex = bySlug.get(slug);
    if (!ex) continue;
    
    if (!isEligible(ex, input)) {
      banned++;
      if (bannedSlugs.length < 5) bannedSlugs.push(slug);
    }
  }
  
  check(
    `All ${UPPER_BODY_PLYOS.length} upper-body plyos allowed for current knee`,
    banned === 0,
    banned > 0 ? `${banned} banned: ${bannedSlugs.join(", ")}` : ""
  );
}

console.log("\n3. All lower-body jumps BANNED for past knee");
{
  const input: GeneratorInput = {
    userId: "test-lower-jump-past",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 22,
    hasAllEquipment: true,
    equipmentIds: [],
    anyKneeInjury: true,
    currentInjuryRegions: [],
    catalogue,
  };
  
  const { isEligible } = await import("../src/lib/program/generate");
  
  let banned = 0;
  let allowed = 0;
  const allowedSlugs: string[] = [];
  
  for (const slug of LOWER_BODY_JUMPS) {
    const ex = bySlug.get(slug);
    if (!ex) continue; // Some may not exist in catalogue
    
    if (isEligible(ex, input)) {
      allowed++;
      if (allowedSlugs.length < 5) allowedSlugs.push(slug);
    } else {
      banned++;
    }
  }
  
  check(
    `All lower-body jumps banned for past knee`,
    allowed === 0,
    allowed > 0 ? `${allowed} allowed: ${allowedSlugs.join(", ")}` : `${banned} banned correctly`
  );
}

console.log("\n4. All lower-body jumps BANNED for current knee");
{
  const input: GeneratorInput = {
    userId: "test-lower-jump-current",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 22,
    hasAllEquipment: true,
    equipmentIds: [],
    anyKneeInjury: true,
    currentInjuryRegions: ["knee"],
    catalogue,
  };
  
  const { isEligible } = await import("../src/lib/program/generate");
  
  let banned = 0;
  let allowed = 0;
  const allowedSlugs: string[] = [];
  
  for (const slug of LOWER_BODY_JUMPS) {
    const ex = bySlug.get(slug);
    if (!ex) continue;
    
    if (isEligible(ex, input)) {
      allowed++;
      if (allowedSlugs.length < 5) allowedSlugs.push(slug);
    } else {
      banned++;
    }
  }
  
  check(
    `All lower-body jumps banned for current knee`,
    allowed === 0,
    allowed > 0 ? `${allowed} allowed: ${allowedSlugs.join(", ")}` : `${banned} banned correctly`
  );
}

console.log("\n5. Mutant 10 killer: LOW-impact jumps excluded (not caught by high-impact filter)");
{
  // Create a synthetic low-impact jump exercise
  // This is only caught by isJumpingExercise, NOT by isHighImpactLegExercise
  // When Mutant 10 disables the lower-body check, isJumpingExercise returns false,
  // so isExcludedForPastKnee would incorrectly return false
  const benchJump = bySlug.get("bench-jump");
  if (!benchJump) {
    check("bench-jump exists in catalogue", false);
    failures++;
    return;
  }
  const lowImpactJump: CandidateExercise = {
    ...benchJump,
    id: "test-low-impact-jump",
    slug: "test-low-impact-jump",
    name: "Test Low-Impact Jump",
    impact: "low", // NOT high, so isHighImpactLegExercise returns false
    primary_muscles: ["quads"], // Lower-body, so hasLowerBodyPrimary should be true
  };
  
  const { isExcludedForPastKnee } = await import("../src/lib/program/past-knee");
  
  const excluded = isExcludedForPastKnee(lowImpactJump);
  check(`Low-impact jump excluded for past knee`, excluded, excluded ? "" : "isExcludedForPastKnee returned false");
}

console.log("\n6. Real generator: no lower-body jumps in past-knee plans");
{
  const input: GeneratorInput = {
    userId: "test-plan-jump",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 22,
    hasAllEquipment: true,
    equipmentIds: [],
    anyKneeInjury: true,
    currentInjuryRegions: [],
    catalogue,
  };
  
  const program = generateProgram(input);
  let jumpsFound = 0;
  const jumpSlugs: string[] = [];
  
  for (const day of program.days) {
    for (const ex of day.exercises) {
      const exercise = byId.get(ex.exerciseId);
      if (exercise && LOWER_BODY_JUMPS.includes(exercise.slug)) {
        jumpsFound++;
        if (jumpSlugs.length < 5) jumpSlugs.push(exercise.slug);
      }
    }
  }
  
  check(
    `No lower-body jumps in past-knee plans`,
    jumpsFound === 0,
    jumpsFound > 0 ? `Found ${jumpsFound}: ${jumpSlugs.join(", ")}` : ""
  );
}

console.log("");
console.log("─".repeat(60));

if (failures > 0) {
  console.log(`FAILED: ${failures} check(s) failed`);
  process.exit(1);
} else {
  console.log("PASSED: All jump guard checks passed");
  process.exit(0);
}
}

main().catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
