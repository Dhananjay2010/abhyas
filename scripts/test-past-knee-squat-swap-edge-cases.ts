#!/usr/bin/env npx tsx
/**
 * Test edge cases for past-knee squat swap ordering wall-sit rules.
 * 
 * Edge case (a): Only wall-sit and spanish-squat available
 *   - Rule: Spanish-squat comes first, because 'wall-sit never first' takes precedence over list order
 *   - Expected: [spanish-squat, wall-sit, ...hinges]
 * 
 * Edge case (b): Only wall-sit available, with no hinges
 *   - Rule: Wall-sit alone is allowed, since it's the only option
 *   - Expected: [wall-sit]
 */

import { readFileSync } from "fs";
import type { CandidateExercise } from "../src/lib/program/generate";
import { rankAlternatives } from "../src/lib/program/alternatives";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

let failures = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("=== Past-knee squat swap edge cases ===\n");

// Create minimal inputs
const wallSit = catalogue.find(e => e.slug === "wall-sit")!;
const spanishSquat = catalogue.find(e => e.slug === "spanish-squat")!;
const gluteBridge = catalogue.find(e => e.slug === "glute-bridge")!;
const legExtensions = catalogue.find(e => e.slug === "leg-extensions")!;

// Edge case (a): Only wall-sit and spanish-squat available (plus hinges)
console.log("Edge case (a): Only wall-sit and spanish-squat available\n");

const poolA = [wallSit, spanishSquat, gluteBridge];
const rankedA = rankAlternatives(
  legExtensions,
  poolA,
  {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    anyKneeInjury: true,
    limit: 10,
    scoreFn: () => 100,
    tieBreakFn: (slug: string) => slug === "wall-sit" ? 1 : slug === "spanish-squat" ? 2 : 3,
  }
);

const slugsA = rankedA.map(r => r.slug);
console.log(`  Swap list: ${slugsA.join(", ")}`);
check("spanish-squat comes first", slugsA[0] === "spanish-squat", 
  slugsA.length > 0 ? `first is ${slugsA[0]}` : "empty list");
check("wall-sit comes after spanish-squat", slugsA.indexOf("wall-sit") > slugsA.indexOf("spanish-squat"),
  `spanish-squat at ${slugsA.indexOf("spanish-squat")}, wall-sit at ${slugsA.indexOf("wall-sit")}`);
check("wall-sit is not first", slugsA[0] !== "wall-sit");

// Edge case (b): Only wall-sit available, with no hinges
console.log("\nEdge case (b): Only wall-sit available, no hinges\n");

const poolB = [wallSit];
const rankedB = rankAlternatives(
  legExtensions,
  poolB,
  {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    anyKneeInjury: true,
    limit: 10,
    scoreFn: () => 100,
    tieBreakFn: () => 1,
  }
);

const slugsB = rankedB.map(r => r.slug);
console.log(`  Swap list: ${slugsB.join(", ")}`);
check("wall-sit is present", slugsB.includes("wall-sit"),
  slugsB.length === 0 ? "empty list" : "");
check("only wall-sit when alone", slugsB.length === 1 && slugsB[0] === "wall-sit",
  `list has ${slugsB.length} items: ${slugsB.join(", ")}`);

console.log(`\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All" : failures} edge case test${failures === 1 ? "" : "s"} passed`);
process.exit(failures === 0 ? 0 : 1);
