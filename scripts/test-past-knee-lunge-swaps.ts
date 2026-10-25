/**
 * Steer 2: Test that past-knee lunge swaps only offer tiered lunges + quad-isolation list,
 * never barbell-squat, leg-press, goblet or other squats.
 */
import { readFileSync } from "node:fs";
import { type CandidateExercise, PAST_KNEE_LUNGE_EXERCISES } from "../src/lib/program/generate";
import { rankAlternatives } from "../src/lib/program/alternatives";
import { pastKneeLungeTier } from "../src/lib/program/past-knee-lunge-order";

const catalogue: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf8"));

let failures = 0;
function check(label: string, ok: boolean, detail: string = ""): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("Steer 2: Past-knee lunge swaps only offer tiered lunges + quad-isolation");
console.log("─".repeat(60));

console.log("\n1. Past-knee lunge swaps: no barbell-squat, leg-press, goblet or other squats");
{
  const lungeAnchors = catalogue.filter(e => e.movement_pattern === "lunge");
  let totalViolations = 0;
  const violationExamples: string[] = [];
  
  for (const anchor of lungeAnchors) {
    const swaps = rankAlternatives(
      anchor,
      catalogue,
      {
        level: "intermediate",
        availableEquipment: null,
        injuryRegions: [],
        anyKneeInjury: true,
        limit: 20,
        scoreFn: (e) => 0,
        tieBreakFn: (slug) => 0,
      }
    );
    
    // Check for forbidden squats
    const forbiddenSquats = ["barbell-squat", "leg-press", "goblet-squat", "box-squat", "bodyweight-squat"];
    const violations = swaps.filter(e => 
      e.movement_pattern === "squat" && 
      !PAST_KNEE_LUNGE_EXERCISES.has(e.slug)
    );
    
    if (violations.length > 0 && violationExamples.length < 3) {
      violationExamples.push(`${anchor.slug} → [${violations.map(v => v.slug).join(", ")}]`);
    }
    totalViolations += violations.length;
  }
  
  check(`No forbidden squats in past-knee lunge swaps`, totalViolations === 0,
    totalViolations > 0 ? `${totalViolations} violations across ${lungeAnchors.length} anchors. Examples: ${violationExamples.join("; ")}` :
    `(${lungeAnchors.length} lunge anchors checked)`);
}

console.log("\n2. Past-knee lunge swaps: only tiered lunges + quad-isolation list allowed");
{
  const testAnchor = catalogue.find(e => e.slug === "split-squat-with-dumbbells");
  if (!testAnchor) {
    check("split-squat-with-dumbbells exists in catalogue", false);
  } else {
    const swaps = rankAlternatives(
      testAnchor,
      catalogue,
      {
        level: "intermediate",
        availableEquipment: null,
        injuryRegions: [],
        anyKneeInjury: true,
        limit: 20,
        scoreFn: (e) => 0,
        tieBreakFn: (slug) => 0,
      }
    );
    
    // All swaps should be either:
    // 1. Lunge-pattern with tier > 0
    // 2. Squat-pattern in PAST_KNEE_LUNGE_EXERCISES
    const invalid = swaps.filter(e => {
      if (e.movement_pattern === "lunge") {
        return pastKneeLungeTier(e) === 0;
      } else if (e.movement_pattern === "squat") {
        return !PAST_KNEE_LUNGE_EXERCISES.has(e.slug);
      }
      // Other patterns (hinge, etc.) are not allowed in the lunge swap list
      return true;
    });
    
    check(`Only tiered lunges + quad-isolation in swaps`, invalid.length === 0,
      invalid.length > 0 ? `${invalid.length} invalid: ${invalid.map(e => e.slug).join(", ")}` :
      `(${swaps.length} swaps checked)`);
  }
}

console.log(`\n${failures === 0 ? "✓ All checks passed" : `✗ ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
