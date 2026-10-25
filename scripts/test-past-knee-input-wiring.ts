/**
 * Test: Real behavioral tests for input builders and past-knee integration.
 * 
 * Tests that buildInjuryFlags correctly builds inputs from real injury rows,
 * and that generated plans and ranked swaps show the expected tier behavior.
 * 
 * npm run test:past-knee-input-wiring
 */
import { readFileSync } from "node:fs";
import { buildInjuryFlags } from "../src/lib/program/injury-regions";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { rankAlternatives, buildPatternList } from "../src/lib/program/alternatives";
import type { Database } from "../src/lib/database.types";

const catalogue: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf8"));

type InjuryRow = {
  severity: Database["public"]["Enums"]["injury_severity"];
  body_region: Database["public"]["Enums"]["body_region"];
};

let failures = 0;
function check(label: string, ok: boolean, detail: string = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` -- ${detail}` : ""}`);
}

console.log("\nInput wiring: buildInjuryFlags behavioral tests");

// Test 1: Past knee row gives anyKneeInjury true
{
  const injuries: InjuryRow[] = [
    { severity: "past", body_region: "knee" },
  ];
  const ctx = buildInjuryFlags(injuries);
  check("Past knee row gives anyKneeInjury=true", ctx.anyKneeInjury === true);
  check("Past knee row gives empty currentInjuryRegions", ctx.currentInjuryRegions.length === 0);
}

// Test 2: Current shoulder row gives anyKneeInjury false
{
  const injuries: InjuryRow[] = [
    { severity: "current", body_region: "shoulder" },
  ];
  const ctx = buildInjuryFlags(injuries);
  check("Current shoulder gives anyKneeInjury=false", ctx.anyKneeInjury === false);
  check("Current shoulder in currentInjuryRegions", ctx.currentInjuryRegions.includes("shoulder"));
}

// Test 3: Both past knee and current hip
{
  const injuries: InjuryRow[] = [
    { severity: "past", body_region: "knee" },
    { severity: "current", body_region: "hip" },
  ];
  const ctx = buildInjuryFlags(injuries);
  check("Past knee + current hip: anyKneeInjury=true", ctx.anyKneeInjury === true);
  check("Past knee + current hip: hip in currentInjuryRegions", ctx.currentInjuryRegions.includes("hip"));
  check("Past knee + current hip: knee NOT in currentInjuryRegions", !ctx.currentInjuryRegions.includes("knee"));
}

// Test 4: Empty injuries array
{
  const injuries: InjuryRow[] = [];
  const ctx = buildInjuryFlags(injuries);
  check("Empty injuries: anyKneeInjury=false", ctx.anyKneeInjury === false);
  check("Empty injuries: no currentInjuryRegions", ctx.currentInjuryRegions.length === 0);
}

console.log("\nBehavioral: Generated plan shows tier behavior");

// Test 5: Past-knee beginner + DB plan contains dumbbell-rear-lunge
{
  const injuries: InjuryRow[] = [{ severity: "past", body_region: "knee" }];
  const ctx = buildInjuryFlags(injuries);
  
  const input: GeneratorInput = {
    userId: "test-wiring-beginner",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "beginner",
    primaryTrack: "weights",
    daysPerWeek: 3,
    yogaDaysPerWeek: 0,
    age: 25,
    bmi: 23,
    hasAllEquipment: false,
    equipmentIds: ["dumbbell", "adjustable_bench"],
    ...ctx,
    catalogue,
  };
  
  const program = generateProgram(input);
  let foundDumbbellRearLunge = false;
  
  for (const day of program.days) {
    if (day.dayType === "rest" || day.dayType === "yoga") continue;
    for (const ex of day.exercises) {
      const candidate = catalogue.find(c => c.id === ex.exerciseId);
      if (candidate && candidate.slug === "dumbbell-rear-lunge") {
        foundDumbbellRearLunge = true;
        break;
      }
    }
    if (foundDumbbellRearLunge) break;
  }
  
  check("Past-knee beginner + DB plan has dumbbell-rear-lunge", foundDumbbellRearLunge);
}

// Test 6: Past-knee beginner + DB lunge swaps contain dumbbell-rear-lunge
{
  const injuries: InjuryRow[] = [{ severity: "past", body_region: "knee" }];
  const ctx = buildInjuryFlags(injuries);
  
  const anchor = catalogue.find(c => c.slug === "split-squat-with-dumbbells");
  if (!anchor) {
    console.log("  note: split-squat-with-dumbbells not found (skip swap test)");
  } else {
    const patterns = buildPatternList(anchor.movement_pattern, ctx.anyKneeInjury);
    const eligible = catalogue.filter(e => 
      patterns.includes(e.movement_pattern) && 
      e.id !== anchor.id &&
      (e.equipment_ids.length === 0 || e.equipment_ids.every(eq => ["dumbbell", "adjustable_bench"].includes(eq)))
    );
    
    const swaps = rankAlternatives(anchor, eligible, {
      level: "beginner",
      availableEquipment: new Set(["dumbbell", "adjustable_bench"]),
      injuryRegions: ctx.currentInjuryRegions,
      anyKneeInjury: ctx.anyKneeInjury,
      limit: 10,
      scoreFn: () => 0,
      tieBreakFn: () => 0,
    });
    
    const dumbbellRearLunge = swaps.find(e => e.slug === "dumbbell-rear-lunge");
    check(
      "Past-knee beginner + DB swaps contain dumbbell-rear-lunge",
      dumbbellRearLunge !== undefined,
      dumbbellRearLunge ? "" : `not found in ${swaps.length} swaps`
    );
    
    if (swaps.length > 0) {
      check(
        "Past-knee beginner + DB swaps[0] is dumbbell-rear-lunge",
        swaps[0].slug === "dumbbell-rear-lunge",
        swaps[0].slug === "dumbbell-rear-lunge" ? "" : `got ${swaps[0].slug}`
      );
    }
  }
}

// Test 7: Healthy user plan does NOT prioritize dumbbell-rear-lunge
{
  const injuries: InjuryRow[] = [];
  const ctx = buildInjuryFlags(injuries);
  
  const input: GeneratorInput = {
    userId: "test-wiring-healthy",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 3,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 24,
    hasAllEquipment: true,
    equipmentIds: [],
    ...ctx,
    catalogue,
  };
  
  const program = generateProgram(input);
  let foundDumbbellRearLunge = false;
  
  for (const day of program.days) {
    if (day.dayType === "rest" || day.dayType === "yoga") continue;
    for (const ex of day.exercises) {
      const candidate = catalogue.find(c => c.id === ex.exerciseId);
      if (candidate && candidate.slug === "dumbbell-rear-lunge") {
        foundDumbbellRearLunge = true;
        break;
      }
    }
    if (foundDumbbellRearLunge) break;
  }
  
  check("Healthy user does NOT prioritize dumbbell-rear-lunge", !foundDumbbellRearLunge,
    foundDumbbellRearLunge ? "found in plan" : "not found (correct)");
}

console.log(`\n${failures === 0 ? "✓ All checks passed" : `✗ ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
