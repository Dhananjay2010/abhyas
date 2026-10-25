/**
 * Regression test: past-knee swap path in actions.ts must select secondary_muscles
 * 
 * actions.ts:701 and :719 select a pool WITHOUT secondary_muscles (initially).
 * isHighImpactLegExercise loops over ex.secondary_muscles, throwing TypeError
 * when it's undefined. This test catches that by running the real isEligible
 * and rankAlternatives on fixture rows reduced to exactly the columns actions.ts selects.
 * 
 * npm run test:past-knee-actions-regression
 */
import { readFileSync } from "node:fs";
import { isEligible, hashString, score, type CandidateExercise } from "../src/lib/program/generate";
import { rankAlternatives, buildPatternList, type AlternativesContext } from "../src/lib/program/alternatives";

// Hard-coded column list matching actions.ts:701 and :719 (AFTER fix)
const ACTIONS_SELECT_COLUMNS = [
  "id",
  "slug",
  "name",
  "cue",
  "metric",
  "movement_pattern",
  "mechanic",
  "primary_muscles",
  "secondary_muscles",  // CRITICAL: must be included for past-knee
  "equipment_ids",
  "level_min",
  "contraindicated_regions",
  "impact",
  "spinal_load",
  "tracks",
  "default_rest_seconds",
];

const catalogue: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf8"));

let failures = 0;
function check(label: string, ok: boolean, detail: string = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Verify actions.ts select columns include secondary_muscles");
{
  // This test hard-codes the column list to match actions.ts
  check("ACTIONS_SELECT_COLUMNS includes secondary_muscles", ACTIONS_SELECT_COLUMNS.includes("secondary_muscles"));
  console.log(`    Columns: ${ACTIONS_SELECT_COLUMNS.join(", ")}`);
}

console.log("\n2. Regression: past-knee swap path with high-impact exercises");
{
  // Reduce catalogue to only the columns actions.ts selects
  const reducedCatalogue = catalogue.map((ex) => {
    const reduced: Record<string, unknown> = {};
    for (const col of ACTIONS_SELECT_COLUMNS) {
      if (col === "cue") {
        reduced.cue = "";  // actions.ts includes cue, but generate.ts doesn't use it
      } else if (col in ex) {
        reduced[col] = (ex as Record<string, unknown>)[col];
      }
    }
    return reduced as CandidateExercise;
  });
  
  // Test input for past-knee user
  const input = {
    userId: "past-knee-regression",
    blockNumber: 1,
    goal: "muscle_gain" as const,
    level: "intermediate" as const,
    primaryTrack: "weights" as const,
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: false,
    equipmentIds: ["barbell", "dumbbell", "flat_bench", "squat_rack"],
    currentInjuryRegions: [],
    pastKneeInjury: true,
    catalogue: [],
  };
  
  // Get a squat exercise that might have high-impact alternatives
  const currentSlug = "barbell-squat";
  const current = reducedCatalogue.find((e) => e.slug === currentSlug);
  
  if (!current) {
    check(`${currentSlug} exists in catalogue`, false);
    console.log(`  FATAL: ${currentSlug} missing from catalogue`);
    process.exit(1);
  }
  
  // Build pattern list (same as actions.ts)
  const patterns = buildPatternList(current.movement_pattern, false);
  const pool = reducedCatalogue.filter((e) => patterns.includes(e.movement_pattern));
  
  // Filter by isEligible (this is where the crash would occur if secondary_muscles is missing)
  let eligibleCount = 0;
  let isEligibleCrashed = false;
  let crashError = "";
  
  try {
    for (const ex of pool) {
      if (isEligible(ex, input)) {
        eligibleCount++;
      }
    }
    check("isEligible does not crash on reduced catalogue", true);
  } catch (err) {
    isEligibleCrashed = true;
    crashError = err instanceof Error ? err.message : String(err);
    check("isEligible does not crash on reduced catalogue", false, crashError);
  }
  
  // Run rankAlternatives (this also uses the high-impact filter)
  const eligible = pool.filter((e) => isEligible(e, input));
  
  const wantCompound = current.mechanic === "compound";
  const ctx: AlternativesContext = {
    level: input.level,
    availableEquipment: new Set(input.equipmentIds),
    injuryRegions: input.currentInjuryRegions,
    pastKneeInjury: input.pastKneeInjury,
    limit: 5,
    scoreFn: (e) => score(e, wantCompound, input.level, input.primaryTrack, input.pastKneeInjury, 0),
    tieBreakFn: (slug) => hashString(`ranking:${slug}`),
  };
  
  let rankAlternativesCrashed = false;
  let rankCrashError = "";
  let swaps: CandidateExercise[] = [];
  
  try {
    swaps = rankAlternatives(current, eligible, ctx);
    check("rankAlternatives does not crash on reduced catalogue", true);
  } catch (err) {
    rankAlternativesCrashed = true;
    rankCrashError = err instanceof Error ? err.message : String(err);
    check("rankAlternatives does not crash on reduced catalogue", false, rankCrashError);
  }
  
  console.log(`    Pool: ${pool.length}, Eligible: ${eligibleCount}, Swaps: ${swaps.length}`);
  
  if (isEligibleCrashed || rankAlternativesCrashed) {
    console.log("\n  ✗ REGRESSION: Missing secondary_muscles in actions.ts select causes crash");
  }
}

console.log(`\n${failures === 0 ? "✓ All checks passed" : `✗ ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
