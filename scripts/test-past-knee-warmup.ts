#!/usr/bin/env tsx
/**
 * Step 3: Warmup test for past-knee mobility filter.
 * 
 * Verifies:
 * 1. Past shoulder and past lower-back produce byte-identical warmups to main (no filtering)
 * 2. Current injuries are filtered (same as main)
 * 3. Past-knee Lower days have no walking-lunge or bodyweight-squat (full-depth)
 */

import { buildWarmupInput, selectWarmup, type WarmupRow } from "../src/lib/program/warmup";
import warmups from "./fixtures/warmups.json";
import type { Database } from "../src/lib/database.types";

type BodyRegion = Database["public"]["Enums"]["body_region"];
type Muscle = Database["public"]["Enums"]["muscle"];

const warmupRows = warmups as unknown as WarmupRow[];

let failures = 0;
function check(label: string, ok: boolean, detail: string = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "✅" : "❌"} ${label}${detail ? ` -- ${detail}` : ""}`);
}

// Test muscles for a Lower day (quads, glutes, hamstrings)
const lowerMuscles: Muscle[] = ["quads", "glutes", "hamstrings"];

console.log("\n1. Past shoulder produces same warmup as no injury");
{
  const noInjury = buildWarmupInput([], warmupRows, lowerMuscles, "weights", null, true);
  const pastShoulder = buildWarmupInput(
    [{ severity: "past", body_region: "shoulder" }],
    warmupRows,
    lowerMuscles,
    "weights",
    null,
    true
  );

  const noInjuryWarmup = selectWarmup(noInjury);
  const pastShoulderWarmup = selectWarmup(pastShoulder);

  // Check byte-identity
  const noInjurySlugs = noInjuryWarmup.map(w => w.slug).join(",");
  const pastShoulderSlugs = pastShoulderWarmup.map(w => w.slug).join(",");

  check("Past shoulder warmup is byte-identical to no injury", noInjurySlugs === pastShoulderSlugs);
}

console.log("\n2. Past lower-back produces same warmup as no injury");
{
  const noInjury = buildWarmupInput([], warmupRows, lowerMuscles, "weights", null, true);
  const pastLowerBack = buildWarmupInput(
    [{ severity: "past", body_region: "lower_back" }],
    warmupRows,
    lowerMuscles,
    "weights",
    null,
    true
  );

  const noInjuryWarmup = selectWarmup(noInjury);
  const pastLowerBackWarmup = selectWarmup(pastLowerBack);

  // Check byte-identity
  const noInjurySlugs = noInjuryWarmup.map(w => w.slug).join(",");
  const pastLowerBackSlugs = pastLowerBackWarmup.map(w => w.slug).join(",");

  check("Past lower-back warmup is byte-identical to no injury", noInjurySlugs === pastLowerBackSlugs);
}

console.log("\n3. Current injuries are filtered (same as main)");
{
  const currentKnee = buildWarmupInput(
    [{ severity: "current", body_region: "knee" }],
    warmupRows,
    lowerMuscles,
    "weights",
    null,
    true
  );

  const warmup = selectWarmup(currentKnee);
  
  // Current knee should filter out MOBILITY exercises that target knee
  // Prehab that targets knee is WANTED (gentle activation)
  const mobilityExercises = warmup.filter(w => w.type === "mobility");
  const hasKneeTargetingMobility = mobilityExercises.some(w => 
    w.target_regions.includes("knee") || (w.contraindicated_regions ?? []).includes("knee")
  );

  check("Current knee filters out knee-targeting mobility", !hasKneeTargetingMobility);
}

console.log("\n4. Past-knee Lower days exclude walking-lunge and bodyweight-squat");
{
  const pastKnee = buildWarmupInput(
    [{ severity: "past", body_region: "knee" }],
    warmupRows,
    lowerMuscles,
    "weights",
    null,
    true
  );

  const warmup = selectWarmup(pastKnee);
  const slugs = warmup.map(w => w.slug);

  check("No walking-lunge in past-knee warmup", !slugs.includes("walking-lunge"));
  check("No bodyweight-squat in past-knee warmup", !slugs.includes("bodyweight-squat"));
  
  // Also verify other past-knee exclusions
  check("No skipping-light in past-knee warmup", !slugs.includes("skipping-light"));
  check("No worlds-greatest in past-knee warmup", !slugs.includes("worlds-greatest"));
}

console.log("\n5. Past-knee prehab is still included (for the injury)");
{
  const pastKnee = buildWarmupInput(
    [{ severity: "past", body_region: "knee" }],
    warmupRows,
    lowerMuscles,
    "weights",
    null,
    true
  );

  const warmup = selectWarmup(pastKnee);
  
  // Prehab exercises that TARGET the knee should be included (gentle activation)
  const hasPrehab = warmup.some(w => w.type === "prehab");
  
  check("Past-knee warmup includes prehab", hasPrehab);
}

console.log("\n=== Summary ===");
if (failures > 0) {
  console.log(`❌ ${failures} check(s) failed`);
  process.exit(1);
} else {
  console.log("✅ All checks passed");
}
