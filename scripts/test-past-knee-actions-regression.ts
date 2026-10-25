/**
 * Regression test: past-knee swap path in actions.ts must select required columns
 * 
 * actions.ts has exercise queries in swapExercise:
 * - Replacement query: .from("exercises").select("...").eq("id", input.newExerciseId)
 * - Current exercise query: .from("exercises").select("...").eq("id", current.exercise_id)
 * - Pool query: .from("exercises").select("...").in("movement_pattern", patterns)
 * 
 * QA (i): secondary_muscles is NOT needed since 66aea16. This test verifies
 * the queries include necessary columns for isEligible/rankAlternatives without crashes.
 * 
 * npm run test:past-knee-actions-regression
 */
import { readFileSync } from "node:fs";
import { isEligible, hashString, score, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { rankAlternatives, buildPatternList, type AlternativesContext } from "../src/lib/program/alternatives";

const catalogue: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf8"));

// Extract BOTH column lists from actions.ts select queries
const actionsContent = readFileSync(__dirname + "/../src/app/session/actions.ts", "utf8");

// Find pool select query (line ~701) - has .in("movement_pattern"
const poolSelectMatch = actionsContent.match(/\.from\("exercises"\)\s*\.select\("([^"]+)"\)\s*\.in\("movement_pattern"/);
if (!poolSelectMatch) {
  throw new Error("Could not find pool select query in actions.ts");
}
const poolColumnsString = poolSelectMatch[1];
const POOL_SELECT_COLUMNS = new Set(poolColumnsString.split(", ").map(c => c.trim()));

// Find inactive fallback select query (line ~719) - has .eq("id", current.exercise_id)
const inactiveSelectMatch = actionsContent.match(/\.from\("exercises"\)\s*\.select\("([^"]+)"\)\s*\.eq\("id", current\.exercise_id\)/);
if (!inactiveSelectMatch) {
  throw new Error("Could not find inactive select query in actions.ts");
}
const inactiveColumnsString = inactiveSelectMatch[1];
const INACTIVE_SELECT_COLUMNS = new Set(inactiveColumnsString.split(", ").map(c => c.trim()));

let failures = 0;
function check(label: string, ok: boolean, detail: string = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Verify actions.ts select columns extracted from source");
{
  console.log(`    Pool select: ${POOL_SELECT_COLUMNS.size} columns`);
  // QA (i): secondary_muscles no longer needed since 66aea16
  check("Pool select includes primary_muscles", POOL_SELECT_COLUMNS.has("primary_muscles"));
  check("Pool select includes movement_pattern", POOL_SELECT_COLUMNS.has("movement_pattern"));
  console.log(`    Inactive select: ${INACTIVE_SELECT_COLUMNS.size} columns`);
  check("Inactive select includes primary_muscles", INACTIVE_SELECT_COLUMNS.has("primary_muscles"));
  check("Inactive select includes movement_pattern", INACTIVE_SELECT_COLUMNS.has("movement_pattern"));
}

console.log("\n2. Test with pool select columns (swap pool query)");
{
  // Reduce catalogue to pool select columns
  const poolCatalogue: CandidateExercise[] = JSON.parse(JSON.stringify(
    catalogue.map((ex) => Object.fromEntries(
      Object.entries(ex).filter(([k]) => POOL_SELECT_COLUMNS.has(k))
    ))
  ));
  
  const input: GeneratorInput = {
    userId: "past-knee-regression",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: false,
    equipmentIds: ["barbell", "dumbbell", "flat_bench", "squat_rack", "medicine_ball"],
    currentInjuryRegions: [],
    anyKneeInjury: true,
    catalogue: [],
  };
  
  // Test patterns with high-impact non-leg moves that have leg secondaries
  const testCases: Array<{ anchor: string; reason: string }> = [
    { anchor: "barbell-bench-press-medium-grip", reason: "horizontal_press pool contains plyo push-ups" },
    { anchor: "barbell-shoulder-press", reason: "vertical_press pool contains medicine-ball-scoop-throw (quads/hamstrings secondary)" },
    { anchor: "crunches", reason: "core pool contains medicine-ball-full-twist" },
    { anchor: "wind-sprints", reason: "cardio pool contains high-impact moves" },
  ];
  
  let totalCrashes = 0;
  
  for (const { anchor, reason } of testCases) {
    const current = poolCatalogue.find((e) => e.slug === anchor);
    
    if (!current) {
      check(`${anchor} exists in catalogue`, false);
      failures++;
      continue;
    }
    
    const patterns = buildPatternList(current.movement_pattern, false);
    const pool = poolCatalogue.filter((e) => patterns.includes(e.movement_pattern));
    
    let crashError = "";
    let eligibleCount = 0;
    
    try {
      for (const ex of pool) {
        if (isEligible(ex, input)) {
          eligibleCount++;
        }
      }
      
      // Run rankAlternatives
      const eligible = pool.filter((e) => isEligible(e, input));
      const wantCompound = current.mechanic === "compound";
      const ctx: AlternativesContext = {
        level: input.level,
        availableEquipment: new Set(input.equipmentIds),
        injuryRegions: input.currentInjuryRegions,
        anyKneeInjury: input.anyKneeInjury,
        limit: 5,
        scoreFn: (e) => score(e, wantCompound, input.level, input.primaryTrack),
        tieBreakFn: (slug) => hashString(`ranking:${slug}`),
      };
      
      const swaps = rankAlternatives(current, eligible, ctx);
      console.log(`    ${anchor}: Pool ${pool.length}, Eligible ${eligibleCount}, Swaps ${swaps.length}`);
    } catch (err) {
      crashError = err instanceof Error ? err.message : String(err);
      totalCrashes++;
      console.log(`    ${anchor}: CRASHED - ${crashError}`);
      console.log(`      Reason: ${reason}`);
    }
  }
  
  check("No crashes with pool select columns", totalCrashes === 0,
    totalCrashes > 0 ? `${totalCrashes} pattern(s) crashed` : "");
}

console.log("\n3. Test with inactive select columns (fallback query)");
{
  // Reduce catalogue to inactive select columns
  const inactiveCatalogue: CandidateExercise[] = JSON.parse(JSON.stringify(
    catalogue.map((ex) => Object.fromEntries(
      Object.entries(ex).filter(([k]) => INACTIVE_SELECT_COLUMNS.has(k))
    ))
  ));
  
  const input: GeneratorInput = {
    userId: "past-knee-regression",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: false,
    equipmentIds: ["barbell", "dumbbell", "flat_bench", "squat_rack", "medicine_ball"],
    currentInjuryRegions: [],
    anyKneeInjury: true,
    catalogue: [],
  };
  
  const testCases: Array<{ anchor: string; reason: string }> = [
    { anchor: "barbell-shoulder-press", reason: "vertical_press pool contains medicine-ball-scoop-throw" },
    { anchor: "crunches", reason: "core pool contains high-impact moves with leg secondaries" },
  ];
  
  let totalCrashes = 0;
  
  for (const { anchor, reason } of testCases) {
    const current = inactiveCatalogue.find((e) => e.slug === anchor);
    
    if (!current) {
      check(`${anchor} exists in catalogue`, false);
      failures++;
      continue;
    }
    
    const patterns = buildPatternList(current.movement_pattern, false);
    const pool = inactiveCatalogue.filter((e) => patterns.includes(e.movement_pattern));
    
    let crashError = "";
    let eligibleCount = 0;
    
    try {
      for (const ex of pool) {
        if (isEligible(ex, input)) {
          eligibleCount++;
        }
      }
      
      const eligible = pool.filter((e) => isEligible(e, input));
      const wantCompound = current.mechanic === "compound";
      const ctx: AlternativesContext = {
        level: input.level,
        availableEquipment: new Set(input.equipmentIds),
        injuryRegions: input.currentInjuryRegions,
        anyKneeInjury: input.anyKneeInjury,
        limit: 5,
        scoreFn: (e) => score(e, wantCompound, input.level, input.primaryTrack),
        tieBreakFn: (slug) => hashString(`ranking:${slug}`),
      };
      
      const swaps = rankAlternatives(current, eligible, ctx);
      console.log(`    ${anchor}: Pool ${pool.length}, Eligible ${eligibleCount}, Swaps ${swaps.length}`);
    } catch (err) {
      crashError = err instanceof Error ? err.message : String(err);
      totalCrashes++;
      console.log(`    ${anchor}: CRASHED - ${crashError}`);
      console.log(`      Reason: ${reason}`);
    }
  }
  
  check("No crashes with inactive select columns", totalCrashes === 0,
    totalCrashes > 0 ? `${totalCrashes} pattern(s) crashed` : "");
}

console.log(`\n${failures === 0 ? "✓ All checks passed" : `✗ ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
