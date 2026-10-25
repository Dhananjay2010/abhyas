/**
 * Regression test: past-knee swap path in actions.ts must select secondary_muscles
 * 
 * actions.ts:701 and :719 select a pool WITHOUT secondary_muscles (initially).
 * isHighImpactLegExercise loops over ex.secondary_muscles, throwing TypeError
 * when it's undefined. This test catches that by extracting the actual column
 * string from actions.ts, reducing fixture rows to those columns, and running
 * the real isEligible and rankAlternatives on patterns that contain high-impact
 * non-leg moves.
 * 
 * npm run test:past-knee-actions-regression
 */
import { readFileSync } from "node:fs";
import { isEligible, hashString, score, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { rankAlternatives, buildPatternList, type AlternativesContext } from "../src/lib/program/alternatives";

const catalogue: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf8"));

// Extract column list from actions.ts pool select query
const actionsContent = readFileSync(__dirname + "/../src/app/session/actions.ts", "utf8");

// Find the pool select query around line 701 - look for the pattern that includes "movement_pattern"
const poolSelectMatch = actionsContent.match(/\.from\("exercises"\)\s*\.select\("([^"]+)"\)\s*\.in\("movement_pattern"/);
if (!poolSelectMatch) {
  throw new Error("Could not find pool select query in actions.ts");
}

const columnsString = poolSelectMatch[1];
const ACTIONS_SELECT_COLUMNS = columnsString.split(", ").map(c => c.trim());

let failures = 0;
function check(label: string, ok: boolean, detail: string = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Verify actions.ts select columns extracted from source");
{
  console.log(`    Extracted ${ACTIONS_SELECT_COLUMNS.length} columns from actions.ts`);
  check("ACTIONS_SELECT_COLUMNS includes secondary_muscles", ACTIONS_SELECT_COLUMNS.includes("secondary_muscles"));
  console.log(`    Columns: ${ACTIONS_SELECT_COLUMNS.join(", ")}`);
}

console.log("\n2. Regression: past-knee swap path with high-impact non-leg exercises");
{
  // Reduce catalogue to only the columns actions.ts selects
  const reducedCatalogue = catalogue.map((ex) => {
    const reduced: Partial<CandidateExercise> = {};
    for (const col of ACTIONS_SELECT_COLUMNS) {
      if (col in ex) {
        (reduced as Record<string, unknown>)[col] = (ex as Record<string, unknown>)[col];
      }
    }
    return reduced;
  }) as CandidateExercise[];
  
  // Test input for past-knee user
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
    pastKneeInjury: true,
    catalogue: [],
  };
  
  // Test multiple patterns that contain high-impact non-leg moves
  const testPatterns: Array<{ anchor: string; pattern: string; reason: string }> = [
    { anchor: "barbell-bench-press", pattern: "horizontal_press", reason: "contains plyo push-ups (high-impact, no leg muscles)" },
    { anchor: "barbell-shoulder-press", pattern: "vertical_press", reason: "contains pike push-ups and overhead variations" },
    { anchor: "crunches", pattern: "core", reason: "contains medicine-ball-scoop-throw (high-impact with leg secondaries)" },
    { anchor: "treadmill-running", pattern: "cardio", reason: "contains wind-sprints (high-impact, mislabeled)" },
  ];
  
  let totalCrashes = 0;
  
  for (const { anchor, pattern, reason } of testPatterns) {
    const current = reducedCatalogue.find((e) => e.slug === anchor);
    
    if (!current) {
      console.log(`    Skipping ${anchor} (not in catalogue)`);
      continue;
    }
    
    // Build pattern list (same as actions.ts)
    const patterns = buildPatternList(pattern, false);
    const pool = reducedCatalogue.filter((e) => patterns.includes(e.movement_pattern));
    
    // Filter by isEligible (this is where the crash occurs if secondary_muscles is missing)
    let isEligibleCrashed = false;
    let crashError = "";
    let eligibleCount = 0;
    
    try {
      for (const ex of pool) {
        if (isEligible(ex, input)) {
          eligibleCount++;
        }
      }
    } catch (err) {
      isEligibleCrashed = true;
      crashError = err instanceof Error ? err.message : String(err);
      totalCrashes++;
    }
    
    // Run rankAlternatives (also uses the high-impact filter)
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
    } catch (err) {
      rankAlternativesCrashed = true;
      rankCrashError = err instanceof Error ? err.message : String(err);
      totalCrashes++;
    }
    
    if (isEligibleCrashed) {
      console.log(`    ${anchor} (${pattern}): isEligible CRASHED - ${crashError}`);
      console.log(`      Reason: ${reason}`);
    } else if (rankAlternativesCrashed) {
      console.log(`    ${anchor} (${pattern}): rankAlternatives CRASHED - ${rankCrashError}`);
      console.log(`      Reason: ${reason}`);
    } else {
      console.log(`    ${anchor} (${pattern}): Pool ${pool.length}, Eligible ${eligibleCount}, Swaps ${swaps.length}`);
    }
  }
  
  check("No crashes in isEligible or rankAlternatives", totalCrashes === 0,
    totalCrashes > 0 ? `${totalCrashes} pattern(s) crashed` : "");
  
  if (totalCrashes > 0) {
    console.log("\n  ✗ REGRESSION: Missing secondary_muscles in actions.ts select causes crash");
  }
}

console.log(`\n${failures === 0 ? "✓ All checks passed" : `✗ ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
