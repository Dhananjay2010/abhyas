#!/usr/bin/env npx tsx
/**
 * Test past-knee squat swap list lengths after PR #152 slice-order fix.
 * 
 * Bug: Lists were sliced to 5 BEFORE filtering, so when knee-risk exercises
 * were filtered out, lists ended up with only 2-4 options. Hinges rarely appeared.
 * 
 * Fix: For past-knee squat swaps, run the class filter (quad isolation + hinge
 * fallbacks) over the FULL deduplicated candidate set, then slice to 5.
 */

import { readFileSync } from "fs";
import type { CandidateExercise } from "../src/lib/program/generate";
import { buildEligibleSwapList, buildGeneratorInput } from "../src/lib/session/eligible-swap-list";
import { rankAlternatives } from "../src/lib/program/alternatives";
import { buildSwapContext } from "../src/lib/program/swap-context";
import { hashString, score, isEligible } from "../src/lib/program/generate";
import { getSwapPatterns } from "../src/lib/program/swap-patterns";
import type { GeneratorInput } from "../src/lib/program/generate";

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
const INJURY_SETS: Array<{ name: string; regions: Array<{ body_region: any; severity: "current" | "past" }> }> = [
  { name: "pk", regions: [{ body_region: "knee", severity: "past" }] },
  { name: "pk_lbc", regions: [{ body_region: "knee", severity: "past" }, { body_region: "lower_back", severity: "current" }] },
  { name: "pk_shc", regions: [{ body_region: "knee", severity: "past" }, { body_region: "shoulder", severity: "current" }] },
];

const LEVELS: Array<"beginner" | "intermediate" | "expert"> = ["beginner", "intermediate", "expert"];
const TRACKS: Array<"weights" | "bodyweight"> = ["weights", "bodyweight"];
const SESSION_IDS = ["a", "b", "c"];

// Get all squat exercises
const squatExercises = catalogue.filter(e => e.movement_pattern === "squat");

console.log("=== Past-Knee Squat Swap List Lengths ===\n");
console.log(`Testing ${INJURY_SETS.length} injury sets × ${EQUIPMENT_PROFILES.length} equipment profiles × ${LEVELS.length} levels × ${TRACKS.length} tracks × ${squatExercises.length} squat exercises × ${SESSION_IDS.length} session ids`);
console.log(`Total cases: ${INJURY_SETS.length * EQUIPMENT_PROFILES.length * LEVELS.length * TRACKS.length * squatExercises.length * SESSION_IDS.length}\n`);

// Allowed exercise types for past-knee squat swaps
const QUAD_ISOLATION = new Set(["leg-extensions", "single-leg-leg-extension", "wall-sit", "spanish-squat"]);
const QUAD_ISOLATION_ORDER = ["leg-extensions", "single-leg-leg-extension", "wall-sit", "spanish-squat"];

let failures = 0;
let totalCases = 0;
const lengthCounts = new Map<number, number>();

// Helper: compute the eligible count by mimicking buildEligibleSwapList's logic
function computeEligibleCount(
  current: CandidateExercise,
  pool: CandidateExercise[],
  generatorInput: GeneratorInput,
  sessionId: string,
  alreadyInSession: Set<string>
): number {
  // Apply the same filtering as buildEligibleSwapList
  const patterns = getSwapPatterns(current.movement_pattern, generatorInput);
  const patternMatches = pool.filter(e => patterns.includes(e.movement_pattern));
  
  const eligible = patternMatches
    .filter(e => !alreadyInSession.has(e.id))
    .filter(e => isEligible(e, generatorInput));
  
  // Rank alternatives with a large limit
  const wantCompound = current.mechanic !== "isolation";
  const scoreFn = (e: CandidateExercise) => 
    score(e, wantCompound, generatorInput.level, generatorInput.primaryTrack);
  const tieBreakFn = (slug: string) => hashString(`${sessionId}:${slug}`);
  const swapContext = buildSwapContext(generatorInput, scoreFn, tieBreakFn);
  
  const allCandidates = rankAlternatives(current, eligible, { ...swapContext, limit: 10000 });
  
  // Apply the past-knee squat swap class filter
  const filtered = allCandidates.filter(e => {
    if (QUAD_ISOLATION.has(e.slug)) return true;
    if (e.movement_pattern === "hinge") {
      const primaryMuscles = Array.isArray(e.primary_muscles) ? e.primary_muscles : [e.primary_muscles];
      return primaryMuscles.includes("glutes") || primaryMuscles.includes("hamstrings");
    }
    return false;
  });
  
  return filtered.length;
}

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
            
            // Track length distribution
            lengthCounts.set(eligible.length, (lengthCounts.get(eligible.length) || 0) + 1);
            
            // Assertion 1: length <= 5
            if (eligible.length > 5) {
              console.log(`✗ FAIL: ${injurySet.name} ${equipProfile.name} ${level} ${track} ${current.slug} ${sessionId}`);
              console.log(`  Length ${eligible.length} > 5`);
              console.log(`  List: ${eligible.map(e => e.slug).join(", ")}`);
              failures++;
              continue;
            }
            
            // Assertion 3: each element is in the allowed class (quad isolation or glute/hamstring hinge)
            for (const ex of eligible) {
              const isQuadIsolation = QUAD_ISOLATION.has(ex.slug);
              const isGluteHamstringHinge = ex.movement_pattern === "hinge" && (() => {
                const primaryMuscles = Array.isArray(ex.primary_muscles) ? ex.primary_muscles : [ex.primary_muscles];
                return primaryMuscles.includes("glutes") || primaryMuscles.includes("hamstrings");
              })();
              
              if (!isQuadIsolation && !isGluteHamstringHinge) {
                console.log(`✗ FAIL: ${injurySet.name} ${equipProfile.name} ${level} ${track} ${current.slug} ${sessionId}`);
                console.log(`  Invalid exercise type: ${ex.slug} (${ex.movement_pattern}, primary: ${ex.primary_muscles})`);
                console.log(`  List: ${eligible.map(e => e.slug).join(", ")}`);
                failures++;
                break;
              }
            }
            
            // Assertion 3: each element is in the allowed class (quad isolation or glute/hamstring hinge)
            const quadIsolationInList = eligible.filter(e => QUAD_ISOLATION.has(e.slug));
            
            // Check wall-sit is never first (unless alone)
            const wallSitIsFirst = eligible.length > 0 && eligible[0].slug === "wall-sit";
            const wallSitIsAlone = eligible.length === 1 && eligible[0].slug === "wall-sit";
            
            if (wallSitIsFirst && !wallSitIsAlone) {
              console.log(`✗ FAIL: ${injurySet.name} ${equipProfile.name} ${level} ${track} ${current.slug} ${sessionId}`);
              console.log(`  wall-sit is first but not alone (list has ${eligible.length} items)`);
              console.log(`  List: ${eligible.map(e => e.slug).join(", ")}`);
              failures++;
              continue;
            }
            
            // Check 4-list order for the quad isolation exercises that aren't wall-sit
            // (wall-sit can be moved out of order to satisfy "never first" rule)
            const nonWallSitQuads = quadIsolationInList.filter(e => e.slug !== "wall-sit");
            for (let i = 0; i < nonWallSitQuads.length - 1; i++) {
              const currentSlug = nonWallSitQuads[i].slug;
              const nextSlug = nonWallSitQuads[i + 1].slug;
              const currentIdx = QUAD_ISOLATION_ORDER.indexOf(currentSlug);
              const nextIdx = QUAD_ISOLATION_ORDER.indexOf(nextSlug);
              
              if (currentIdx > nextIdx) {
                console.log(`✗ FAIL: ${injurySet.name} ${equipProfile.name} ${level} ${track} ${current.slug} ${sessionId}`);
                console.log(`  Quad isolation order violated (excluding wall-sit): ${currentSlug} (pos ${currentIdx}) before ${nextSlug} (pos ${nextIdx})`);
                console.log(`  Non-wall-sit quads: ${nonWallSitQuads.map(e => e.slug).join(", ")}`);
                console.log(`  Full list: ${eligible.map(e => e.slug).join(", ")}`);
                failures++;
                break;
              }
            }
          }
        }
      }
    }
  }
}

console.log(`\n=== Length Distribution ===`);
const sortedLengths = Array.from(lengthCounts.entries()).sort((a, b) => a[0] - b[0]);
for (const [len, count] of sortedLengths) {
  const pct = (count / totalCases * 100).toFixed(1);
  console.log(`Length ${len}: ${count} cases (${pct}%)`);
}

console.log(`\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "PASSED" : `FAILED: ${failures} failures out of ${totalCases} cases`}`);
process.exit(failures === 0 ? 0 : 1);
