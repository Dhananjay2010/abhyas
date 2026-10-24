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
  PAST_KNEE_LUNGE_EXERCISES,
  type CandidateExercise, 
  type GeneratorInput,
} from "../src/lib/program/generate";
import { buildPatternList, rankAlternatives } from "../src/lib/program/alternatives";
import { getSwapPatterns } from "../src/lib/program/swap-patterns";
import { hasAnyKneeInjury, currentInjuryRegions } from "../src/lib/program/injury-regions";

type BodyRegion = "core" | "neck" | "shoulder" | "elbow" | "wrist" | "upper_back" | "lower_back" | "hip" | "knee" | "ankle";
type InjurySeverity = "current" | "past";

interface InjuryRow {
  region: BodyRegion;
  severity: InjurySeverity;
}

const fixture = "scripts/fixtures/catalogue.json";
const catalogue = JSON.parse(readFileSync(fixture, "utf8")) as CandidateExercise[];

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

// Test (c): Past-knee never-empty swap fallback
console.log("\n(c) Past-knee never-empty swap fallback");
{
  // The fallback code at alternatives.ts:304 adds wall-sit when deduplicated is empty
  // for past-knee lunge swaps. However, past-knee lunge exercises are filtered at isEligible,
  // so in practice the fallback is not reached. But we can test it by calling rankAlternatives
  // directly with a synthetic lunge exercise (bypassing isEligible's 4-list check).
  
  const pastKneeInjuries: InjuryRow[] = [{ region: "knee", severity: "past" }];
  const anyKneeInjury = hasAnyKneeInjury(pastKneeInjuries);
  const currentInjuries = currentInjuryRegions(pastKneeInjuries);
  
  // Use a real lunge exercise
  const syntheticLunge = catalogue.find(e => e.movement_pattern === "lunge" && e.slug === "split-squat-with-dumbbells");
  const wallSit = catalogue.find(e => e.slug === "wall-sit");
  
  if (!syntheticLunge || !wallSit) {
    check("Found test exercises", false, `lunge=${!!syntheticLunge}, wallSit=${!!wallSit}`);
  } else {
    // Create a scenario where wall-sit is in candidates but filtered by equipment check.
    // The 4-list check (line 200-205) allows only PAST_KNEE_LUNGE_EXERCISES.
    // Pass wall-sit in candidates, but restrict equipment so it can't be ranked normally.
    // Then the fallback (which ignores equipment for bodyweight exercises) adds it.
    
    // Pass only wall-sit, and use equipment restriction
    const ranked = rankAlternatives(
      syntheticLunge,
      [wallSit],
      {
        level: "beginner",
        availableEquipment: new Set(["barbell"]), // Wall-sit needs no equipment, so availableEquipment mismatch doesn't help
        injuryRegions: currentInjuries,
        anyKneeInjury: true, // Past knee
        limit: 5,
        scoreFn: (e) => score(e, true, "beginner", "bodyweight"),
        tieBreakFn: (s) => hashString(`test:${s}`),
      }
    );
    
    // Wall-sit has no equipment, so it passes the equipment check and gets ranked normally.
    // The fallback only triggers if deduplicated is EMPTY.
    // To make it empty, we need to filter wall-sit by something else.
    
    // Actually, let's test differently: pass NO candidates that match the 4-list.
    // Then deduplicated will be empty, and fallback looks for wall-sit in candidates.
    // But if wall-sit is not in candidates, fallback can't add it.
    
    // The key insight: fallback adds wall-sit ONLY if it's in candidates but not yet in deduplicated.
    // Let me test by passing candidates that DON'T pass the 4-list check.
    
    const nonPastKneeLunges = catalogue.filter(e => 
      e.movement_pattern === "squat" && 
      !PAST_KNEE_LUNGE_EXERCISES.has(e.slug)
    );
    
    const ranked2 = rankAlternatives(
      syntheticLunge,
      [...nonPastKneeLunges, wallSit], // Wall-sit is in candidates
      {
        level: "expert", // Filter out beginner exercises, possibly including wall-sit
        availableEquipment: null,
        injuryRegions: currentInjuries,
        anyKneeInjury: true,
        limit: 5,
        scoreFn: (e) => score(e, true, "expert", "weights"),
        tieBreakFn: (s) => hashString(`test:${s}`),
      }
    );
    
    // If wall-sit is beginner level, it's filtered by level check, leaving deduplicated empty.
    // Then fallback adds it IF it has no equipment.
    check("Past-knee lunge swaps non-empty via fallback", ranked2.length > 0,
      ranked2.length === 0 ? "EMPTY" : `${ranked2.length} swaps`);
    
    if (ranked2.length > 0) {
      check("Fallback includes wall-sit", ranked2.some(r => r.slug === "wall-sit"),
        `Swaps: ${ranked2.map(r => r.slug).join(", ")}`);
    }
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
