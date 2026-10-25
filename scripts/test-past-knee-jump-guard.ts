/**
 * Item 12 (HIGH-2): Real generator + swap jump/plyo guard test
 * 
 * Tests that the jump/plyo exclusion guard (generate.ts ~line 571) works correctly
 * for past-knee users across real plan generation and swap ranking.
 */

import { readFileSync } from "node:fs";
import {
  generateProgram,
  hashString,
  score,
  type CandidateExercise,
  type GeneratorInput,
} from "../src/lib/program/generate";
import { 
  rankAlternatives, 
  buildPatternList,
  type AlternativesContext 
} from "../src/lib/program/alternatives";

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

// Jump/plyo detection
function isJumpOrPlyo(ex: CandidateExercise): boolean {
  if (ex.impact !== "high") return false;
  
  const nameLower = ex.name.toLowerCase();
  const slugLower = ex.slug.toLowerCase();
  
  return (
    nameLower.includes("jump") ||
    nameLower.includes("bound") ||
    nameLower.includes("plyo") ||
    slugLower.includes("jump") ||
    slugLower.includes("bound") ||
    slugLower.includes("plyo")
  );
}

console.log("Item 12: Real generator + swap jump/plyo guard test");
console.log("─".repeat(60));

// Test 1: Real generator over past-knee grid
console.log("\n1. Real generator: no jumps/plyo in past-knee plans");
{
  const levels = ["beginner", "intermediate", "expert"] as const;
  const goals = ["muscle_gain", "strength"] as const;
  const days = [3, 4];
  const durations = [45, 60];
  
  let plansChecked = 0;
  let jumpsFound = 0;
  
  for (const level of levels) {
    for (const goal of goals) {
      for (const daysPerWeek of days) {
        for (const duration of durations) {
          const input: GeneratorInput = {
            userId: `test-jump-${level}-${goal}-${daysPerWeek}-${duration}`,
            blockNumber: 1,
            goal,
            level,
            primaryTrack: "weights",
            daysPerWeek,
            yogaDaysPerWeek: 0,
            age: 30,
            bmi: 22,
            hasAllEquipment: true,
            equipmentIds: [],
            anyKneeInjury: true,
            currentInjuryRegions: [],
            preferredSessionMinutes: duration,
            catalogue,
          };
          
          const program = generateProgram(input);
          plansChecked++;
          
          for (const day of program.days) {
            for (const ex of day.exercises) {
              const exercise = byId.get(ex.exerciseId);
              if (exercise && isJumpOrPlyo(exercise)) {
                jumpsFound++;
              }
            }
          }
        }
      }
    }
  }
  
  check(
    `No jumps/plyo in ${plansChecked} past-knee plans`,
    jumpsFound === 0,
    jumpsFound > 0 ? `Found ${jumpsFound} jump/plyo exercises` : ""
  );
}

// Test 2: Real swap ranking for various exercises
console.log("\n2. Real swap ranking: no jumps/plyo in past-knee swaps");
{
  const testCases = [
    { slug: "barbell-squat", pattern: "squat" },
    { slug: "barbell-lunge", pattern: "lunge" },
    { slug: "leg-extensions", pattern: "leg_ext" },
    { slug: "glute-bridge", pattern: "hip_ext" },
  ];
  
  let swapsChecked = 0;
  let jumpsInSwaps = 0;
  
  for (const tc of testCases) {
    const current = bySlug.get(tc.slug);
    if (!current) continue;
    
    const input: GeneratorInput = {
      userId: "test-swap-jump",
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
      preferredSessionMinutes: 60,
      catalogue,
    };
    
    const patterns = buildPatternList(current.movement_pattern, false);
    const rawPool = catalogue.filter(e => patterns.includes(e.movement_pattern));
    
    const wantCompound = current.mechanic === "compound";
    const ctx: AlternativesContext = {
      level: input.level,
      availableEquipment: null,
      injuryRegions: input.currentInjuryRegions,
      anyKneeInjury: input.anyKneeInjury,
      limit: 10,
      scoreFn: (e) => score(e, wantCompound, input.level, input.primaryTrack),
      tieBreakFn: (slug) => hashString(`test:${slug}`),
    };
    
    const swaps = rankAlternatives(current, rawPool, ctx);
    swapsChecked++;
    
    for (const swap of swaps) {
      if (isJumpOrPlyo(swap)) {
        jumpsInSwaps++;
      }
    }
  }
  
  check(
    `No jumps/plyo in ${swapsChecked} swap lists`,
    jumpsInSwaps === 0,
    jumpsInSwaps > 0 ? `Found ${jumpsInSwaps} jump/plyo in swaps` : ""
  );
}

console.log("");
console.log("─".repeat(60));

if (failures > 0) {
  console.log(`FAILED: ${failures} check(s) failed`);
  process.exit(1);
} else {
  console.log("PASSED: All jump/plyo guard checks passed");
  process.exit(0);
}
