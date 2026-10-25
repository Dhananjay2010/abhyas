/**
 * Swap Mutation Tests
 * 
 * Tests specific code paths to ensure mutations are killed.
 * Each test targets one mutant that previously survived.
 */

import { readFileSync } from "node:fs";
import { 
  isEligible, 
  score,
  hashString,
  UNSAFE_KNEE_LUNGES,
  type CandidateExercise, 
  type GeneratorInput,
} from "../src/lib/program/generate";
import { buildPatternList, rankAlternatives } from "../src/lib/program/alternatives";
import { getSwapPatterns } from "../src/lib/program/swap-patterns";
import { hasAnyKneeInjury, currentInjuryRegions, type InjuryRow } from "../src/lib/program/injury-regions";

const fixture = "scripts/fixtures/catalogue.json";
const catalogue: CandidateExercise[] = JSON.parse(readFileSync(fixture, "utf8"));

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

console.log("Swap Mutation Kill Tests");
console.log("─".repeat(60));

// Test (a): Drop knee high-impact filter in alternatives
console.log("\n(a) High-impact filter for knee injuries in swaps");
{
  const kneeInjuries: InjuryRow[] = [{ region: "knee", severity: "current" }];
  const anyKneeInjury = hasAnyKneeInjury(kneeInjuries);
  const currentInjuries = currentInjuryRegions(kneeInjuries);
  
  // Create a pool of candidates that BYPASSES isEligible's anyKneeInjury check
  // so we can test rankAlternatives' filter in isolation
  const noKneeInput: GeneratorInput = {
    userId: "test-user",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],  // No injuries for isEligible
    anyKneeInjury: false,
    catalogue,
  };
  
  // Test a cardio exercise to find high-impact lower-body alternatives
  const cardio = catalogue.find(e => e.movement_pattern === "cardio");
  if (!cardio) throw new Error("No cardio found");
  
  const patterns = buildPatternList("cardio", false, false);
  const pool = catalogue.filter(c => patterns.includes(c.movement_pattern));
  const eligible = pool.filter(c => isEligible(c, noKneeInput));
  
  // Now rank with KNEE injury context - rankAlternatives should filter high-impact lower
  const ranked = rankAlternatives(
    cardio,
    eligible,
    {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: currentInjuries,
      anyKneeInjury, // Apply knee filter in rankAlternatives
      limit: 20,
      scoreFn: (e) => score(e, true, "intermediate", "weights"),
      tieBreakFn: (slug) => hashString(`test:${slug}`),
    }
  );
  
  // Check for high-impact lower-body alternatives
  let highImpactFound = 0;
  const violations: string[] = [];
  for (const alt of ranked) {
    if (alt.impact === "high") {
      const lowerBodyMuscles = ["quads", "glutes", "hamstrings", "calves", "adductors", "abductors"];
      const isLowerBody = alt.primary_muscles.some(m => lowerBodyMuscles.includes(m));
      if (isLowerBody) {
        highImpactFound++;
        if (violations.length < 5) {
          violations.push(alt.slug);
        }
      }
    }
  }
  
  check("No high-impact lower-body alternatives for knee injuries", highImpactFound === 0,
    highImpactFound > 0 ? `Found ${highImpactFound}: ${violations.join(", ")}` : undefined);
}

// Test (a) for past-knee too
console.log("\n(a) High-impact filter for past-knee injuries in swaps");
{
  const pastKneeInjuries: InjuryRow[] = [{ region: "knee", severity: "past" }];
  const anyKneeInjury = hasAnyKneeInjury(pastKneeInjuries);
  const currentInjuries = currentInjuryRegions(pastKneeInjuries);
  
  const input: GeneratorInput = {
    userId: "test-user",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: currentInjuries,
    anyKneeInjury,
    catalogue,
  };
  
  const lowerBodyPatterns = ["squat", "lunge", "hinge"];
  const lowerBodyExercises = catalogue.filter(e => lowerBodyPatterns.includes(e.movement_pattern));
  
  let highImpactFound = 0;
  
  for (const ex of lowerBodyExercises) {
    const wantCompound = ex.mechanic !== "isolation";
    const patterns = buildPatternList(ex.movement_pattern, anyKneeInjury, currentInjuries.includes("knee"));
    const pool = catalogue.filter(c => patterns.includes(c.movement_pattern));
    const eligible = pool.filter(c => isEligible(c, input));
    
    const ranked = rankAlternatives(
      ex,
      eligible,
      {
        level: input.level,
        availableEquipment: null,
        injuryRegions: currentInjuries,
        anyKneeInjury,
        limit: 20,
        scoreFn: (e) => score(e, wantCompound, input.level, input.primaryTrack),
        tieBreakFn: (slug) => hashString(`test:${slug}`),
      }
    );
    
    for (const alt of ranked) {
      if (alt.impact === "high") {
        const lowerBodyMuscles = ["quads", "glutes", "hamstrings", "calves", "adductors", "abductors"];
        if (alt.primary_muscles.some(m => lowerBodyMuscles.includes(m))) {
          highImpactFound++;
        }
      }
    }
  }
  
  check("No high-impact lower-body alternatives for past-knee", highImpactFound === 0,
    highImpactFound > 0 ? `Found ${highImpactFound}` : undefined);
}

// Test (b): Drop anyKneeInjury in getSwapPatterns
console.log("\n(b) getSwapPatterns anyKneeInjury handling");
{
  const kneeInput: GeneratorInput = {
    userId: "test",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: ["knee"],
    anyKneeInjury: true,
    catalogue,
  };
  
  const noKneeInput: GeneratorInput = {
    ...kneeInput,
    currentInjuryRegions: [],
    anyKneeInjury: false,
  };
  
  // Test lunge pattern
  const kneePatternsLunge = getSwapPatterns("lunge", kneeInput);
  const noKneePatternsLunge = getSwapPatterns("lunge", noKneeInput);
  
  check("Knee lunge patterns differ from no-knee", 
    JSON.stringify(kneePatternsLunge) !== JSON.stringify(noKneePatternsLunge),
    `knee: [${kneePatternsLunge}], no-knee: [${noKneePatternsLunge}]`);
  
  // No-knee should include squat fallback
  check("No-knee lunge includes squat fallback", noKneePatternsLunge.includes("squat"));
  
  // Knee should NOT include squat fallback (would widen to unsafe squats)
  check("Knee lunge excludes squat fallback", !kneePatternsLunge.includes("squat"));
  
  // Knee should include hinge and core
  check("Knee lunge includes hinge", kneePatternsLunge.includes("hinge"));
  check("Knee lunge includes core", kneePatternsLunge.includes("core"));
  
  // End-to-end: verify swap list differs
  const splitSquat = catalogue.find(e => e.slug === "split-squat-with-dumbbells");
  if (splitSquat) {
    const kneeSwaps = rankAlternatives(splitSquat, catalogue.filter(e => kneePatternsLunge.includes(e.movement_pattern) && isEligible(e, kneeInput)), {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: ["knee"],
      anyKneeInjury: true,
      limit: 5,
      scoreFn: (e) => score(e, true, "intermediate", "weights"),
      tieBreakFn: (s) => hashString(`test:${s}`),
    });
    
    const noKneeSwaps = rankAlternatives(splitSquat, catalogue.filter(e => noKneePatternsLunge.includes(e.movement_pattern) && isEligible(e, noKneeInput)), {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      anyKneeInjury: false,
      limit: 5,
      scoreFn: (e) => score(e, true, "intermediate", "weights"),
      tieBreakFn: (s) => hashString(`test:${s}`),
    });
    
    check("Knee vs no-knee swap lists differ for split-squat",
      JSON.stringify(kneeSwaps.map(s => s.slug)) !== JSON.stringify(noKneeSwaps.map(s => s.slug)));
  }
}

// Test (d): Unsafe-lunge list check
console.log("\n(d) Unsafe-lunge list check (only applies to knee injuries)");
{
  // The mutant inverts the condition: it filters UNSAFE lunges for NON-injured users
  // and allows them for injured users. Test both scenarios.
  
  const kneeInput: GeneratorInput = {
    userId: "knee-user",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 23,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],
    anyKneeInjury: true,
    catalogue,
  };
  
  const noInjuryInput: GeneratorInput = {
    ...kneeInput,
    userId: "healthy-user",
    anyKneeInjury: false,
  };
  
  // Test that NO-injury users CAN use these exercises (check doesn't apply)
  let healthyCanUse = 0;
  for (const slug of Array.from(UNSAFE_KNEE_LUNGES)) {
    const ex = catalogue.find(e => e.slug === slug);
    if (ex) {
      const eligible = isEligible(ex, noInjuryInput);
      // For intermediate level, check if exercise would be eligible without injury
      // Some might still be filtered by level (expert), but at least some should pass
      if (eligible) {
        healthyCanUse++;
      }
    }
  }
  
  // Knee-injured users CANNOT use these exercises
  let kneeCannotUse = 0;
  for (const slug of Array.from(UNSAFE_KNEE_LUNGES)) {
    const ex = catalogue.find(e => e.slug === slug);
    if (ex) {
      const eligible = isEligible(ex, kneeInput);
      if (!eligible) {
        kneeCannotUse++;
      }
    }
  }
  
  check("Knee users cannot use UNSAFE lunges", kneeCannotUse === UNSAFE_KNEE_LUNGES.size,
    `${kneeCannotUse}/${UNSAFE_KNEE_LUNGES.size} filtered`);
  
  // The key test: healthy users can use at least SOME of these (the mutant would break this)
  check("Healthy users can use some UNSAFE lunges", healthyCanUse > 0,
    `${healthyCanUse}/${UNSAFE_KNEE_LUNGES.size} available`);
}

console.log("\n" + "─".repeat(60));
console.log(`Summary: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
