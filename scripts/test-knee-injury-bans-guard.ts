/**
 * Knee Injury Bans Guard Test (PR #151 Coordinator)
 * 
 * Comprehensive guard: tests REAL generator excludes ALL knee-banned exercises
 * (sissy squats + UNSAFE_KNEE_LUNGES) from plans and swap lists.
 * 
 * Imports authoritative lists from generate.ts.
 */

import { readFileSync } from "node:fs";
import {
  generateProgram,
  isEligible,
  UNSAFE_KNEE_LUNGES,
  type GeneratorInput,
  type CandidateExercise,
} from "../src/lib/program/generate";
import { buildSwapContext } from "../src/lib/program/swap-context";
import { rankAlternatives, buildPatternList } from "../src/lib/program/alternatives";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
);

if (!Array.isArray(catalogue) || catalogue.length === 0) {
  console.error("❌ FATAL: catalogue.json is empty or invalid");
  process.exit(1);
}

console.log("Knee Injury Bans Guard Test (PR #151)");
console.log("─".repeat(60));

let failed = 0;

function check(desc: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${desc}`);
  } else {
    console.log(`  ✗ ${desc}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

const byId = new Map(catalogue.map((e) => [e.id, e]));

// Build comprehensive banned list
const bannedSlugs: string[] = [];

// 1. Sissy squats (line 571 of generate.ts)
const sissy = catalogue.find(e => e.slug.includes("sissy"));
if (sissy) {
  bannedSlugs.push(sissy.slug);
}

// 2. UNSAFE_KNEE_LUNGES from generate.ts
for (const slug of Array.from(UNSAFE_KNEE_LUNGES)) {
  bannedSlugs.push(slug);
}

console.log(`Monitoring ${bannedSlugs.length} banned exercises:`);
for (const slug of bannedSlugs) {
  console.log(`  - ${slug}`);
}
console.log("");

// Test profile: past knee injury
const pastKneeInput: GeneratorInput = {
  userId: "guard-past-knee",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "expert",
  primaryTrack: "weights",
  daysPerWeek: 5,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 22,
  hasAllEquipment: true,
  equipmentIds: [],
  currentInjuryRegions: [],
  anyKneeInjury: true,
  preferredSessionMinutes: 75,
  catalogue,
};

// Test isEligible API
console.log("Testing isEligible API...");
for (const slug of bannedSlugs) {
  const ex = catalogue.find(e => e.slug === slug);
  if (ex) {
    const eligible = isEligible(ex, pastKneeInput);
    check(
      `isEligible excludes ${slug}`,
      !eligible,
      eligible ? `CRITICAL: ${slug} is eligible for past knee` : undefined
    );
  }
}

// Test plan generation
console.log("");
console.log("Testing plan generation...");
const plan = generateProgram(pastKneeInput);

for (const slug of bannedSlugs) {
  const found = plan.days.some(day =>
    day.exercises.some(ex => {
      const e = byId.get(ex.exerciseId);
      return e?.slug === slug;
    })
  );
  check(`Plan excludes ${slug}`, !found, found ? `Found ${slug} in plan` : undefined);
}

// Test swap lists
console.log("");
console.log("Testing swap lists...");

const scoreFn = (e: CandidateExercise) => e.id ? 1.0 : 1.0;
const tieBreakFn = (slug: string) => slug ? 0 : 0;
const baseContext = buildSwapContext(pastKneeInput, scoreFn, tieBreakFn);

let swapViolations = 0;

for (const day of plan.days) {
  for (const ex of day.exercises) {
    const exercise = byId.get(ex.exerciseId);
    if (!exercise) continue;

    const patternPriority = buildPatternList(
      exercise.movement_pattern,
      pastKneeInput.anyKneeInjury ?? false
    );

    const ctx = {
      ...baseContext,
      pattern: patternPriority,
      limit: 100,
    };

    const candidates = catalogue.filter(e =>
      e.id !== exercise.id &&
      e.tracks.includes(pastKneeInput.primaryTrack) &&
      isEligible(e, pastKneeInput)
    );

    const swaps = rankAlternatives(exercise, candidates, ctx);

    for (const slug of bannedSlugs) {
      const foundInSwaps = swaps.some(swap => swap.slug === slug);
      if (foundInSwaps) {
        swapViolations++;
        check(
          `Swap list for ${exercise.slug} excludes ${slug}`,
          false,
          `CRITICAL: ${slug} in swap list`
        );
      }
    }
  }
}

if (swapViolations === 0) {
  console.log(`  ✓ All swap lists exclude all ${bannedSlugs.length} banned exercises`);
}

console.log("");
console.log("─".repeat(60));
if (failed > 0) {
  console.log(`FAILED: ${failed} checks failed`);
  process.exit(1);
} else {
  console.log(`PASSED: All ${bannedSlugs.length} knee bans verified`);
}
