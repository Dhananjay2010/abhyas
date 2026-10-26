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

type GoldenEntry = {
  slugs: string[];
  length: number;
  sha256: string;
};

const golden: Record<string, GoldenEntry> = {};
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
            
            // Compute sha256 of the slug list for integrity checking
            const sha256 = createHash('sha256').update(slugs.join(',')).digest('hex');
            
            golden[key] = {
              slugs,
              length: slugs.length,
              sha256,
            };
          }
        }
      }
    }
  }
}

// Sort keys for deterministic output
const sortedGolden: Record<string, GoldenEntry> = {};
const sortedKeys = Object.keys(golden).sort();
for (const key of sortedKeys) {
  sortedGolden[key] = golden[key];
}

// Compute distribution
const lengthCounts = new Map<number, number>();
for (const entry of Object.values(golden)) {
  lengthCounts.set(entry.length, (lengthCounts.get(entry.length) || 0) + 1);
}

console.log("=== Length Distribution ===");
const sortedLengths = Array.from(lengthCounts.entries()).sort((a, b) => a[0] - b[0]);
for (const [len, count] of sortedLengths) {
  const pct = (count / totalCases * 100).toFixed(1);
  console.log(`Length ${len}: ${count} cases (${pct}%)`);
}

// Write to file
const outputPath = "scripts/fixtures/past-knee-squat-swap-golden.json";
writeFileSync(outputPath, JSON.stringify(sortedGolden, null, 2));

console.log(`\n✓ Generated ${totalCases} golden entries`);
console.log(`✓ Written to ${outputPath}`);
console.log(`✓ File size: ${(JSON.stringify(sortedGolden).length / 1024 / 1024).toFixed(2)} MB`);
