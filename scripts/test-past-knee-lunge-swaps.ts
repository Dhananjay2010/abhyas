/**
 * Steer 2: Test that past-knee lunge swaps include tiered lunges, quad-isolation, and safe hinge fallbacks,
 * but never barbell-squat, leg-press, goblet or other knee-loading squats.
 * 
 * Updated per Run 2 feedback B: lunge swaps use hinge or bridge fallbacks (no ab/core moves).
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

console.log("Steer 2: Past-knee lunge swaps = tiered lunges + quad-isolation + safe hinge fallbacks");
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
        scoreFn: () => 0,
        tieBreakFn: () => 0,
      }
    );
    
    // Check for forbidden squats (non-quad-isolation squats)
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

console.log("\n2. Past-knee lunge swaps: tiered lunges + quad-isolation + safe hinge fallbacks");
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
        scoreFn: () => 0,
        tieBreakFn: () => 0,
      }
    );
    
    // All swaps should be either:
    // 1. Lunge-pattern with tier > 0
    // 2. Squat-pattern in PAST_KNEE_LUNGE_EXERCISES (quad isolation)
    // 3. Hinge pattern (safe fallback, no knee loading)
    // Core/ab exercises are NOT allowed (QA LOW: no ab moves in lower-body fallbacks)
    const invalid = swaps.filter(e => {
      if (e.movement_pattern === "lunge") {
        return pastKneeLungeTier(e) === 0;
      } else if (e.movement_pattern === "squat") {
        return !PAST_KNEE_LUNGE_EXERCISES.has(e.slug);
      } else if (e.movement_pattern === "hinge") {
        return false; // Hinge patterns are allowed (safe fallbacks)
      } else if (e.movement_pattern === "core") {
        return true; // Core patterns are NOT allowed
      }
      // Other patterns not expected
      return true;
    });
    
    check(`Only tiered lunges + quad-isolation + hinge in swaps`, invalid.length === 0,
      invalid.length > 0 ? `${invalid.length} invalid: ${invalid.map(e => e.slug).join(", ")}` :
      `(${swaps.length} swaps checked)`);
  }
}

console.log(`\n${failures === 0 ? "✓ All checks passed" : `✗ ${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
