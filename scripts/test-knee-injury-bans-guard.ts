/**
 * Knee Injury Bans Guard Test (PR #151 Coordinator)
 * 
 * Comprehensive guard that exercises the REAL generator and verifies ALL knee-banned
 * exercises are excluded from plans and swap lists for knee-injured users.
 * 
 * Imports the authoritative lists from generate.ts rather than copying them.
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

// Build comprehensive banned list for knee injuries
const bannedExercises = new Set<string>();

// 1. Sissy squats (ANY knee injury) - line 571 of generate.ts
const sissyExercises = catalogue.filter(e => e.slug.includes("sissy"));
for (const ex of sissyExercises) {
  bannedExercises.add(ex.slug);
}

// 2. Unsafe lunges (ANY knee injury) - imported from generate.ts
for (const slug of UNSAFE_KNEE_LUNGES) {
  bannedExercises.add(slug);
}

console.log(`Monitoring ${bannedExercises.size} banned exercises:`);
for (const slug of bannedExercises) {
  console.log(`  - ${slug}`);
}
console.log("");

// Test knee-injury profile (past knee injury for comprehensive coverage)
const kneeInjuryInput: GeneratorInput = {
  userId: "knee-guard-test",
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
  injuryHistory: ["knee"],
  anyKneeInjury: true,
  sessionLengthMinutes: 75,
  hasSafetyBars: true,
  forceIncludeLowerBody: false,
  catalogue,
};

// Test isEligible API directly
console.log("Testing isEligible API...");
const sissyEx = catalogue.find(e => e.slug.includes("sissy"));
if (sissyEx) {
  const sissyEligible = isEligible(sissyEx, kneeInjuryInput);
  check(
    `isEligible excludes sissy squat for knee injury`,
    !sissyEligible,
    sissyEligible ? `CRITICAL: sissy squat is eligible for knee injury` : undefined
  );
}

for (const slug of UNSAFE_KNEE_LUNGES) {
  const ex = catalogue.find(e => e.slug === slug);
  if (ex) {
    const eligible = isEligible(ex, kneeInjuryInput);
    check(
      `isEligible excludes ${slug}`,
      !eligible,
      eligible ? `CRITICAL: ${slug} is eligible` : undefined
    );
  }
}

console.log("");

console.log("Testing plan generation...");
const program = generateProgram(kneeInjuryInput);
const allPlanExercises = new Set<string>();

for (const day of program.days) {
  for (const ex of day.exercises) {
    allPlanExercises.add(ex.slug);
  }
}

// Verify no banned exercises in plan
let planViolations: string[] = [];
for (const slug of bannedExercises) {
  if (allPlanExercises.has(slug)) {
    planViolations.push(slug);
  }
}

check(
  `Plan excludes all ${bannedExercises.size} banned exercises`,
  planViolations.length === 0,
  planViolations.length > 0 ? `FOUND: ${planViolations.join(", ")}` : undefined
);

// Test swap lists
console.log("");
console.log("Testing swap lists...");

const byId = new Map(catalogue.map((e) => [e.id, e]));
let swapViolations: Array<{day: number; exSlug: string; bannedInSwaps: string[]}> = [];

for (let dayIdx = 0; dayIdx < program.days.length; dayIdx++) {
  const day = program.days[dayIdx];
  const focusGroups = day.exercises
    .map(e => byId.get(e.id)?.primary_muscles?.[0])
    .filter((g): g is string => g !== undefined && g !== null)
    .filter((g, i, arr) => arr.indexOf(g) === i);

  for (const planEx of day.exercises) {
    const planExFull = byId.get(planEx.id);
    if (!planExFull) continue;

    const swapContext = buildSwapContext(planEx, {
      userId: kneeInjuryInput.userId,
      blockNumber: kneeInjuryInput.blockNumber,
      currentDayMuscles: focusGroups,
      programme: program.days,
      dayIndex: dayIdx,
    });

    const candidates = catalogue.filter(e =>
      isEligible(e, kneeInjuryInput) &&
      e.id !== planEx.id
    );

    const patterns = buildPatternList(
      planExFull,
      candidates,
      kneeInjuryInput
    );

    const swapList = rankAlternatives(patterns, swapContext);
    const bannedInSwaps: string[] = [];

    for (const alt of swapList) {
      const ex = byId.get(alt.exerciseId);
      if (ex && bannedExercises.has(ex.slug)) {
        bannedInSwaps.push(ex.slug);
      }
    }

    if (bannedInSwaps.length > 0) {
      swapViolations.push({
        day: dayIdx + 1,
        exSlug: planEx.slug,
        bannedInSwaps,
      });
    }
  }
}

check(
  `All swap lists exclude banned exercises`,
  swapViolations.length === 0,
  swapViolations.length > 0
    ? `${swapViolations.length} violations: ${swapViolations.map(v => `day${v.day}/${v.exSlug} has [${v.bannedInSwaps.join(",")}]`).slice(0, 3).join("; ")}`
    : undefined
);

// Final summary
console.log("");
console.log("─".repeat(60));
if (failed > 0) {
  console.log(`FAILED: ${failed} checks failed`);
  process.exit(1);
} else {
  console.log(`PASSED: All knee injury bans verified`);
}
