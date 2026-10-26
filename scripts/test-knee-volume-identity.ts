#!/usr/bin/env npx tsx
/**
 * Test knee-volume identity: non-knee profiles must be identical to main's baseline.
 * Knee profiles: report changed/unchanged counts split by past/current.
 */

import { readFileSync } from "fs";
import { createHash } from "crypto";
import { generateProgram, type CandidateExercise } from "../src/lib/program/generate";
import { NON_KNEE_PROFILES, KNEE_PROFILES, makeGeneratorInput } from "./knee-volume-grid";

const baselinePath = "scripts/fixtures/knee-volume-baseline.json";
const baseline = JSON.parse(readFileSync(baselinePath, "utf-8"));

console.log(`Loaded baseline from main ${baseline.mainCommit.slice(0, 8)}, ${baseline.profiles.length} profiles`);

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
) as CandidateExercise[];

const baselineMap = new Map(baseline.profiles.map((p: { id: string; sha256: string }) => [p.id, p.sha256]));

// Test non-knee profiles
const nonKneeChanges: string[] = [];
console.log(`\nTesting ${NON_KNEE_PROFILES.length} non-knee profiles...`);

for (const spec of NON_KNEE_PROFILES) {
  const input = makeGeneratorInput(spec, catalogue);
  const result = generateProgram(input);
  const json = JSON.stringify(result);
  const sha256 = createHash("sha256").update(json).digest("hex");
  const expected = baselineMap.get(spec.id);
  
  if (!expected) {
    console.error(`ERROR: No baseline hash for ${spec.id}`);
    process.exit(1);
  }
  
  if (sha256 !== expected) {
    nonKneeChanges.push(spec.id);
  }
}

if (nonKneeChanges.length > 0) {
  console.error(`\nFAIL: ${nonKneeChanges.length} non-knee profiles changed (expected 0):`);
  nonKneeChanges.slice(0, 10).forEach(id => console.error(`  - ${id}`));
  if (nonKneeChanges.length > 10) {
    console.error(`  ... and ${nonKneeChanges.length - 10} more`);
  }
  process.exit(1);
}

console.log(`✓ All ${NON_KNEE_PROFILES.length} non-knee profiles identical`);

// Test knee profiles
console.log(`\nTesting ${KNEE_PROFILES.length} knee profiles...`);

const pastKneeChanges: string[] = [];
const pastKneeUnchanged: string[] = [];
const currentKneeChanges: string[] = [];
const currentKneeUnchanged: string[] = [];

for (const spec of KNEE_PROFILES) {
  const input = makeGeneratorInput(spec, catalogue);
  const result = generateProgram(input);
  const json = JSON.stringify(result);
  const sha256 = createHash("sha256").update(json).digest("hex");
  const expected = baselineMap.get(spec.id);
  
  if (!expected) {
    console.error(`ERROR: No baseline hash for ${spec.id}`);
    process.exit(1);
  }
  
  const changed = sha256 !== expected;
  const isPastKnee = spec.id.includes("past-knee");
  
  if (isPastKnee) {
    if (changed) {
      pastKneeChanges.push(spec.id);
    } else {
      pastKneeUnchanged.push(spec.id);
    }
  } else {
    if (changed) {
      currentKneeChanges.push(spec.id);
    } else {
      currentKneeUnchanged.push(spec.id);
    }
  }
}

console.log(`\nKnee profile results:`);
console.log(`  Past knee: ${pastKneeChanges.length} changed, ${pastKneeUnchanged.length} unchanged`);
console.log(`  Current knee: ${currentKneeChanges.length} changed, ${currentKneeUnchanged.length} unchanged`);

// Section 4 invariants are checked in test-knee-volume.ts
console.log(`\n✓ Identity test passed: all non-knee profiles identical`);
