/**
 * Item 16: Olympic lifts in swaps test
 * 
 * Tests that Olympic lifts (clean, snatch, jerk) are properly excluded
 * for injured members in both plan generation and swap lists.
 */
import { readFileSync } from "node:fs";
import { 
  generateProgram, 
  type CandidateExercise, 
  type GeneratorInput,
  isOlympicLift,
  isAllowedSwapTarget,
  isEligible,
} from "../src/lib/program/generate";
import { buildPatternList, rankAlternatives } from "../src/lib/program/alternatives";

const catalogue: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf8"));

let failures = 0;
function check(label: string, ok: boolean, detail: string = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function base(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
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
    currentInjuryRegions: [],
    anyKneeInjury: false,
    catalogue,
    ...overrides,
  };
}

console.log("Item 16: Olympic Lifts Exclusion Test");
console.log("─".repeat(60));

console.log("\n1. Current-injury user plans contain NO Olympic lifts");
{
  // Test multiple injury types
  const injuryTypes = ["knee", "shoulder", "lower_back", "elbow"];
  
  for (const injury of injuryTypes) {
    const input = base({
      currentInjuryRegions: [injury],
      anyKneeInjury: injury === "knee",
    });
    
    const program = generateProgram(input);
    let olympicCount = 0;
    const olympicSlugs: string[] = [];
    
    for (const day of program.days) {
      for (const ex of day.exercises) {
        const exercise = catalogue.find(e => e.id === ex.exerciseId);
        if (exercise && isOlympicLift(exercise)) {
          olympicCount++;
          olympicSlugs.push(exercise.slug);
        }
      }
    }
    
    check(`Current ${injury} injury: NO Olympic lifts in plan`, olympicCount === 0,
      olympicCount > 0 ? `Found: ${olympicSlugs.slice(0, 3).join(", ")}` : "");
  }
}

console.log("\n2. Current-knee user glute-bridge swaps contain NO Olympic lifts");
{
  const gluteBridge = catalogue.find(e => e.slug === "glute-bridge");
  if (!gluteBridge) {
    check("glute-bridge exists in catalogue", false);
  } else {
    const patterns = buildPatternList(gluteBridge.movement_pattern, true, true);
    const pool = catalogue.filter(e => patterns.includes(e.movement_pattern));
    
    const swaps = rankAlternatives(
      gluteBridge,
      pool,
      {
        level: "intermediate",
        availableEquipment: null,
        injuryRegions: ["knee"],
        anyKneeInjury: true,
        limit: 20,
        scoreFn: (e) => 0,
        tieBreakFn: (slug) => 0,
      }
    );
    
    const olympicInSwaps = swaps.filter(e => isOlympicLift(e));
    check(`Current knee glute-bridge swaps: NO Olympic lifts`, olympicInSwaps.length === 0,
      olympicInSwaps.length > 0 ? `Found: ${olympicInSwaps.map(e => e.slug).join(", ")}` : "");
  }
}

console.log("\n3. isAllowedSwapTarget validator rejects Olympic lifts for current-injury users");
{
  const powerClean = catalogue.find(e => e.slug === "power-clean");
  if (!powerClean) {
    check("power-clean exists in catalogue", false);
  } else {
    // Current knee injury: should reject
    const kneeRejected = !isAllowedSwapTarget(powerClean, {
      currentInjuryRegions: ["knee"],
      anyKneeInjury: true,
    });
    check("Validator rejects power-clean for current knee", kneeRejected);
    
    // Current shoulder injury: should reject
    const shoulderRejected = !isAllowedSwapTarget(powerClean, {
      currentInjuryRegions: ["shoulder"],
      anyKneeInjury: false,
    });
    check("Validator rejects power-clean for current shoulder", shoulderRejected);
    
    // Past knee injury (no current): should ALLOW
    const pastKneeAllowed = isAllowedSwapTarget(powerClean, {
      currentInjuryRegions: [],
      anyKneeInjury: true,
    });
    check("Validator ALLOWS power-clean for past knee (no current injury)", pastKneeAllowed);
  }
}

console.log("\n4. Healthy user is offered Olympic lifts where equipment allows");
{
  const gluteBridge = catalogue.find(e => e.slug === "glute-bridge");
  if (!gluteBridge) {
    check("glute-bridge exists in catalogue", false);
  } else {
    const patterns = buildPatternList(gluteBridge.movement_pattern, false, false);
    const pool = catalogue.filter(e => patterns.includes(e.movement_pattern));
    
    const swaps = rankAlternatives(
      gluteBridge,
      pool,
      {
        level: "intermediate",
        availableEquipment: null,
        injuryRegions: [],
        anyKneeInjury: false,
        limit: 20,
        scoreFn: (e) => 0,
        tieBreakFn: (slug) => 0,
      }
    );
    
    const olympicInSwaps = swaps.filter(e => isOlympicLift(e));
    check(`Healthy user glute-bridge swaps: Olympic lifts available`, olympicInSwaps.length > 0,
      olympicInSwaps.length > 0 ? `Found ${olympicInSwaps.length}: ${olympicInSwaps.slice(0, 3).map(e => e.slug).join(", ")}` : "");
    
    // We already verified Olympic lifts are available above (olympicInSwaps.length > 0)
    // Just double-check that at least one is present
    check("Healthy user has access to Olympic lifts in swaps", olympicInSwaps.length > 0);
  }
}

console.log("\n5. Swap-eligible ⊆ generator-eligible for every injury profile");
{
  type InjuryProfile = {
    currentInjuryRegions: ("core" | "neck" | "shoulder" | "elbow" | "wrist" | "upper_back" | "lower_back" | "hip" | "knee" | "ankle")[];
    anyKneeInjury: boolean;
    label: string;
  };
  
  const injuryProfiles: InjuryProfile[] = [
    { currentInjuryRegions: ["knee"], anyKneeInjury: true, label: "current knee" },
    { currentInjuryRegions: ["shoulder"], anyKneeInjury: false, label: "current shoulder" },
    { currentInjuryRegions: [], anyKneeInjury: true, label: "past knee" },
    { currentInjuryRegions: [], anyKneeInjury: false, label: "healthy" },
  ];
  
  for (const profile of injuryProfiles) {
    const input = base(profile);
    
    // Sample exercise: glute-bridge
    const gluteBridge = catalogue.find(e => e.slug === "glute-bridge");
    if (!gluteBridge) continue;
    
    const patterns = buildPatternList(
      gluteBridge.movement_pattern, 
      profile.anyKneeInjury, 
      profile.currentInjuryRegions.includes("knee")
    );
    const pool = catalogue.filter(e => patterns.includes(e.movement_pattern));
    
    // Get swap candidates
    const swaps = rankAlternatives(
      gluteBridge,
      pool,
      {
        level: input.level,
        availableEquipment: null,
        injuryRegions: input.currentInjuryRegions,
        anyKneeInjury: input.anyKneeInjury,
        limit: 50,
        scoreFn: (e) => 0,
        tieBreakFn: (slug) => 0,
      }
    );
    
    // Check each swap is eligible in generator
    let violations = 0;
    const violationSlugs: string[] = [];
    
    for (const swap of swaps) {
      if (!isEligible(swap, input)) {
        violations++;
        violationSlugs.push(swap.slug);
      }
    }
    
    check(`${profile.label}: swap-eligible ⊆ generator-eligible`, violations === 0,
      violations > 0 ? `${violations} violations: ${violationSlugs.slice(0, 3).join(", ")}` : "");
  }
}

console.log(`\n${failures === 0 ? "✓ All checks passed" : `✗ ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
