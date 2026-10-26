#!/usr/bin/env npx tsx
/**
 * Generate golden fixture for past-knee squat swap lists.
 * 
 * Runs buildEligibleSwapList over the full matrix and writes the expected
 * top-5 slugs to scripts/fixtures/past-knee-squat-swap-golden.json.
 * 
 * This fixture is the source of truth for test:past-knee-squat-swap-lengths
 * and enables mutant testing without circular dependencies.
 */

import { writeFileSync, readFileSync } from "fs";
import type { CandidateExercise } from "../src/lib/program/generate";
import { buildEligibleSwapList, buildGeneratorInput } from "../src/lib/session/eligible-swap-list";
import { createHash } from "crypto";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

// Equipment profiles using real slugs
const EQUIPMENT_PROFILES: Array<{ name: string; ids: string[] }> = [
  { name: "all", ids: [] }, // hasAllEquipment = true
  { name: "none", ids: [] }, // bodyweight only
  { name: "db", ids: ["dumbbell"] },
  { name: "dbbench", ids: ["dumbbell", "flat_bench"] },
  { name: "kb", ids: ["kettlebell"] },
  { name: "band", ids: ["resistance_band"] },
  { name: "bb", ids: ["barbell", "squat_rack", "flat_bench"] },
  { name: "mach", ids: ["machine_generic", "leg_extension", "leg_curl", "cable_machine", "leg_press"] },
  { name: "dbband", ids: ["dumbbell", "resistance_band"] },
  { name: "pub", ids: ["pull_up_bar"] },
  { name: "legext", ids: ["leg_extension"] },
];

// Injury combinations
type BodyRegion = "knee" | "lower_back" | "shoulder";
const INJURY_SETS: Array<{ name: string; regions: Array<{ body_region: BodyRegion; severity: "current" | "past" }> }> = [
  { name: "pk", regions: [{ body_region: "knee", severity: "past" }] },
  { name: "pk_lbc", regions: [{ body_region: "knee", severity: "past" }, { body_region: "lower_back", severity: "current" }] },
  { name: "pk_shc", regions: [{ body_region: "knee", severity: "past" }, { body_region: "shoulder", severity: "current" }] },
];

const LEVELS: Array<"beginner" | "intermediate" | "expert"> = ["beginner", "intermediate", "expert"];
const TRACKS: Array<"weights" | "bodyweight"> = ["weights", "bodyweight"];
const SESSION_IDS = ["a", "b", "c"];

// Get all squat exercises
const squatExercises = catalogue.filter(e => e.movement_pattern === "squat");

console.log("=== Generating Golden Fixture for Past-Knee Squat Swaps ===\n");
console.log(`Matrix: ${INJURY_SETS.length} injury sets × ${EQUIPMENT_PROFILES.length} equipment profiles × ${LEVELS.length} levels × ${TRACKS.length} tracks × ${squatExercises.length} squat exercises × ${SESSION_IDS.length} session ids`);
console.log(`Total cases: ${INJURY_SETS.length * EQUIPMENT_PROFILES.length * LEVELS.length * TRACKS.length * squatExercises.length * SESSION_IDS.length}\n`);

type CaseResult = {
  slugs: string[];
  length: number;
};

const allCases: Record<string, CaseResult> = {};
let totalCases = 0;

for (const injurySet of INJURY_SETS) {
  for (const equipProfile of EQUIPMENT_PROFILES) {
    for (const level of LEVELS) {
      for (const track of TRACKS) {
        for (const current of squatExercises) {
          for (const sessionId of SESSION_IDS) {
            totalCases++;
            
            // Build generator input
            const generatorInput = buildGeneratorInput({
              userId: "test-user",
              profile: {
                goal: "muscle_gain",
                level,
                primary_track: track,
                days_per_week: 3,
                yoga_days_per_week: 0,
                date_of_birth: "1990-01-01",
                height_cm: 175,
                has_all_equipment: equipProfile.name === "all",
              },
              equipmentIds: equipProfile.ids,
              injuries: injurySet.regions,
              weightKg: 75,
            });
            
            // Build eligible swap list
            const eligible = buildEligibleSwapList({
              currentExercise: current,
              sessionExerciseId: sessionId,
              generatorInput,
              pool: catalogue,
              alreadyInSession: new Set([current.id]),
            });
            
            const slugs = eligible.map(e => e.slug);
            const key = `${injurySet.name}|${equipProfile.name}|${level}|${track}|${current.slug}|${sessionId}`;
            
            allCases[key] = {
              slugs,
              length: slugs.length,
            };
          }
        }
      }
    }
  }
}

// Compute distribution
const lengthCounts = new Map<number, number>();
for (const entry of Object.values(allCases)) {
  lengthCounts.set(entry.length, (lengthCounts.get(entry.length) || 0) + 1);
}

const distribution: Record<string, number> = {};
for (const [len, count] of lengthCounts.entries()) {
  distribution[len.toString()] = count;
}

console.log("=== Length Distribution ===");
const sortedLengths = Array.from(lengthCounts.entries()).sort((a, b) => a[0] - b[0]);
for (const [len, count] of sortedLengths) {
  const pct = (count / totalCases * 100).toFixed(1);
  console.log(`Length ${len}: ${count} cases (${pct}%)`);
}

// Sort keys for deterministic output
const sortedKeys = Object.keys(allCases).sort();

// Compute aggregate sha256: serialize all cases as compact JSON with sorted keys
const compactCases: Record<string, string[]> = {};
for (const key of sortedKeys) {
  compactCases[key] = allCases[key].slugs;
}
const aggregateSha256 = createHash('sha256').update(JSON.stringify(compactCases)).digest('hex');

console.log(`\n=== Aggregate SHA-256 ===`);
console.log(aggregateSha256);

// Select subset: all length-4 cases + ~200 deterministic cases (every ~167th sorted key)
const length4Keys = sortedKeys.filter(k => allCases[k].length === 4);
const subsetInterval = Math.floor(sortedKeys.length / 200);
const subsetKeys = new Set<string>(length4Keys);

for (let i = 0; i < sortedKeys.length; i += Math.max(1, subsetInterval)) {
  subsetKeys.add(sortedKeys[i]);
}

const subset: Record<string, string[]> = {};
for (const key of Array.from(subsetKeys).sort()) {
  subset[key] = allCases[key].slugs;
}

console.log(`\n=== Subset ===`);
console.log(`Length-4 cases: ${length4Keys.length}`);
console.log(`Sampled cases: ${Array.from(subsetKeys).length - length4Keys.length}`);
console.log(`Total subset: ${subsetKeys.size}`);

// Write compact fixture
const compactFixture = {
  distribution,
  aggregateSha256,
  subset,
};

const outputPath = "scripts/fixtures/past-knee-squat-swap-golden.json";
writeFileSync(outputPath, JSON.stringify(compactFixture, null, 2));

const fixtureBytes = JSON.stringify(compactFixture, null, 2).length;
console.log(`\n✓ Generated ${totalCases} golden entries`);
console.log(`✓ Written to ${outputPath}`);
console.log(`✓ File size: ${fixtureBytes.toLocaleString()} bytes (${(fixtureBytes / 1024).toFixed(2)} KB)`);
