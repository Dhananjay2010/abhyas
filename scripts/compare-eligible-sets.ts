#!/usr/bin/env tsx
/**
 * Compare eligible sets: main vs branch
 */

import { readFileSync, cpSync, rmSync } from "fs";
import { execSync } from "child_process";
import { isEligible, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";

const catalogue: CandidateExercise[] = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
);

const profiles = [
  { injury: "none", current: [], anyKnee: false },
  { injury: "past-knee", current: [], anyKnee: true },
  { injury: "current-knee", current: ["knee"], anyKnee: true },
];

const THREE_SLUGS = new Set([
  "calf-press-on-the-leg-press-machine",
  "landmine-linear-jammer",
  "single-arm-linear-jammer",
]);

console.log("Comparing eligible sets: main e92cb08f vs branch");
console.log("=".repeat(80));
console.log("");

// Get branch results first
const branchResults: Record<string, string[]> = {};
for (const profile of profiles) {
  const input: GeneratorInput = {
    userId: "test",
    blockNumber: 1,
    goal: "strength",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 0,
    age: null,
    bmi: null,
    hasAllEquipment: false,
    equipmentIds: ["barbell", "squat_rack", "flat_bench", "dumbbell", "landmine", "leg_press"],
    currentInjuryRegions: profile.current,
    anyKneeInjury: profile.anyKnee,
    preferredSessionMinutes: 60,
    catalogue,
  };
  const eligible = catalogue.filter(ex => isEligible(ex, input));
  branchResults[profile.injury] = eligible.map(ex => ex.slug).sort();
}

// Swap to main and get main results
console.log("Switching to main source files...");
cpSync("src", "/tmp/src-branch", { recursive: true });
execSync("git worktree add /tmp/main-src-temp e92cb08f 2>/dev/null || true", { stdio: "pipe" });
cpSync("/tmp/main-src-temp/src", "src", { recursive: true });

// Force module reload by using dynamic import with cache bust
const mainResults: Record<string, string[]> = {};
for (const profile of profiles) {
  const testCode = `
    import { readFileSync } from "fs";
    import { isEligible } from "./src/lib/program/generate.js";
    const catalogue = JSON.parse(readFileSync("scripts/fixtures/catalogue.json", "utf-8"));
    const input = {
      userId: "test",
      blockNumber: 1,
      goal: "strength",
      level: "intermediate",
      primaryTrack: "weights",
      daysPerWeek: 4,
      yogaDaysPerWeek: 0,
      age: null,
      bmi: null,
      hasAllEquipment: false,
      equipmentIds: ["barbell", "squat_rack", "flat_bench", "dumbbell", "landmine", "leg_press"],
      currentInjuryRegions: ${JSON.stringify(profile.current)},
      anyKneeInjury: ${profile.anyKnee},
      preferredSessionMinutes: 60,
      catalogue,
    };
    const eligible = catalogue.filter(ex => isEligible(ex, input));
    console.log(JSON.stringify(eligible.map(ex => ex.slug).sort()));
  `;
  const mainOut = execSync(`npx tsx --eval '${testCode}'`, { 
    encoding: "utf-8",
    cwd: "/workspace"
  });
  mainResults[profile.injury] = JSON.parse(mainOut.trim());
}

// Restore branch src
cpSync("/tmp/src-branch", "src", { recursive: true });
rmSync("/tmp/src-branch", { recursive: true, force: true });
execSync("git worktree remove --force /tmp/main-src-temp 2>/dev/null || true", { stdio: "pipe" });

console.log("Source restored to branch");
console.log("");

// Compare
let allPass = true;
for (const profile of profiles) {
  console.log(`Profile: ${profile.injury}`);
  const mainSet = new Set(mainResults[profile.injury]);
  const branchSet = new Set(branchResults[profile.injury]);
  
  const removed = mainResults[profile.injury].filter(s => !branchSet.has(s));
  const added = branchResults[profile.injury].filter(s => !mainSet.has(s));
  
  console.log(`  Main: ${mainSet.size} eligible`);
  console.log(`  Branch: ${branchSet.size} eligible`);
  console.log(`  Removed: ${removed.length}${removed.length > 0 ? " (" + removed.join(", ") + ")" : ""}`);
  console.log(`  Added: ${added.length}${added.length > 0 ? " (" + added.join(", ") + ")" : ""}`);
  
  if (profile.injury === "none") {
    if (removed.length === 0 && added.length === 0) {
      console.log(`  ✅ PASS: Identical`);
    } else {
      console.log(`  ❌ FAIL: No-injury should be identical`);
      allPass = false;
    }
  } else if (profile.injury === "past-knee") {
    const expectedRemoved = removed.filter(s => THREE_SLUGS.has(s));
    const unexpectedRemoved = removed.filter(s => !THREE_SLUGS.has(s));
    if (expectedRemoved.length === 3 && unexpectedRemoved.length === 0 && added.length === 0) {
      console.log(`  ✅ PASS: Exactly 3 slugs removed, no unexpected changes`);
    } else {
      console.log(`  ❌ FAIL: Expected 3 removals, ${unexpectedRemoved.length} unexpected`);
      allPass = false;
    }
  } else if (profile.injury === "current-knee") {
    const jammerSlugs = new Set(["landmine-linear-jammer", "single-arm-linear-jammer"]);
    const expectedRemoved = removed.filter(s => jammerSlugs.has(s));
    const unexpectedRemoved = removed.filter(s => !jammerSlugs.has(s));
    if (expectedRemoved.length === 2 && unexpectedRemoved.length === 0 && added.length === 0) {
      console.log(`  ✅ PASS: Exactly 2 jammers removed, no unexpected changes`);
    } else {
      console.log(`  ❌ FAIL: Expected 2 jammers, ${unexpectedRemoved.length} unexpected`);
      allPass = false;
    }
  }
  console.log("");
}

console.log("=".repeat(80));
if (allPass) {
  console.log("✅ ALL VERIFIED: past-knee exclusion only affects agreed slugs");
  process.exit(0);
} else {
  console.log("❌ FAILED: Unexpected differences detected");
  process.exit(1);
}
