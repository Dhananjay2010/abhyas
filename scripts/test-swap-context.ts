/**
 * Test for buildSwapContext helper
 * 
 *   npm run test:swap-context
 */
import { buildSwapContext } from "../src/lib/program/swap-context";
import type { GeneratorInput, CandidateExercise } from "../src/lib/program/generate";

let passed = 0;
let failed = 0;

function check(desc: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${desc}`);
    passed++;
  } else {
    console.log(`  ✗ ${desc}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

console.log("Swap Context Builder Tests");
console.log("─".repeat(60));

const input: GeneratorInput = {
  userId: "test",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 23,
  hasAllEquipment: false,
  equipmentIds: ["dumbbell", "barbell"],
  preferredSessionMinutes: 60,
  currentInjuryRegions: ["knee"],
  anyKneeInjury: true,
  catalogue: [],
};

const scoreFn = (e: CandidateExercise) => (e.mechanic === "compound" ? 100 : 50);
const tieBreakFn = (slug: string) => slug.charCodeAt(0);

const ctx = buildSwapContext(input, scoreFn, tieBreakFn);

check("Context includes level", ctx.level === "intermediate");
check("Context includes injury regions", ctx.injuryRegions.length === 1 && ctx.injuryRegions[0] === "knee");
check("Context includes anyKneeInjury", ctx.anyKneeInjury === true);
check("Context includes equipment set", ctx.availableEquipment instanceof Set && ctx.availableEquipment.has("dumbbell"));
check("Context includes limit", ctx.limit === 5);
check("Context includes scoreFn", typeof ctx.scoreFn === "function");
check("Context includes tieBreakFn", typeof ctx.tieBreakFn === "function");

// Test with hasAllEquipment
const input2: GeneratorInput = {
  ...input,
  hasAllEquipment: true,
};

const ctx2 = buildSwapContext(input2, scoreFn, tieBreakFn);
check("Context with hasAllEquipment has null equipment", ctx2.availableEquipment === null);

// Test anyKneeInjury false when no knee injury
const input3: GeneratorInput = {
  ...input,
  currentInjuryRegions: ["shoulder"],
  anyKneeInjury: false,
};

const ctx3 = buildSwapContext(input3, scoreFn, tieBreakFn);
check("Context without knee injury has anyKneeInjury false", ctx3.anyKneeInjury === false);

console.log("\n" + "─".repeat(60));
console.log(`Summary: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
