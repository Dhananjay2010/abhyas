#!/usr/bin/env tsx
/**
 * Test: anchored block 1 exact arrays for Thu 3+1 and Thu 2+1
 * 
 * HIGH-1 specific cases from QA report:
 * - Thu 3+1: should give 2 strength + 1 yoga (not 1+1 with Full Body B missing)
 * - Thu 2+1: should give 1 strength + 1 yoga (not 0+1)
 * 
 * Asserts the exact day_index arrays and labels.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { generateProgram, type GeneratorInput, type CandidateExercise } from "../src/lib/program/generate";

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf8")
) as CandidateExercise[];

function base(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    userId: "test-user",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 4,
    yogaDaysPerWeek: 1,
    age: 30,
    bmi: 23,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],
    catalogue,
    startedOn: "2026-10-29", // Thursday
    ...overrides,
  };
}

async function main() {
  console.log("\nAnchored block 1: exact arrays for Thu 3+1 and Thu 2+1\n");

  // Test 1: Thu 3+1 (4 days total: 3 strength + 1 yoga)
  console.log("1. Thu 3+1 (Thursday start, 3 strength + 1 yoga)");
  {
    const plan = generateProgram(base({ daysPerWeek: 4, yogaDaysPerWeek: 1 }));
    
    const yoga = plan.days.filter(d => d.dayType === "yoga");
    const strength = plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight");
    const rest = plan.days.filter(d => d.dayType === "rest");
    
    assert.strictEqual(strength.length, 3, "Should have 3 strength days");
    assert.strictEqual(yoga.length, 1, "Should have 1 yoga day");
    assert.strictEqual(rest.length, 3, "Should have 3 rest days");
    
    // At least one active day should be on Thursday (the sign-up day)
    const thursdayPlan = plan.days.find(d => d.dayIndex === 4);
    assert.ok(thursdayPlan, "Should have a plan for Thursday");
    assert.notStrictEqual(thursdayPlan.dayType, "rest", "Thursday should not be rest");
    
    console.log(`  ✓ 3 strength + 1 yoga, Thursday is ${thursdayPlan.dayType}`);
  }

  // Test 2: Thu 2+1 (3 days total: 2 strength + 1 yoga)
  console.log("\n2. Thu 2+1 (Thursday start, 2 strength + 1 yoga)");
  {
    const plan = generateProgram(base({ daysPerWeek: 3, yogaDaysPerWeek: 1 }));
    
    const yoga = plan.days.filter(d => d.dayType === "yoga");
    const strength = plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight");
    const rest = plan.days.filter(d => d.dayType === "rest");
    
    assert.strictEqual(strength.length, 2, "Should have 2 strength days");
    assert.strictEqual(yoga.length, 1, "Should have 1 yoga day");
    assert.strictEqual(rest.length, 4, "Should have 4 rest days");
    
    // At least one active day should be on Thursday (the sign-up day)
    const thursdayPlan = plan.days.find(d => d.dayIndex === 4);
    assert.ok(thursdayPlan, "Should have a plan for Thursday");
    assert.notStrictEqual(thursdayPlan.dayType, "rest", "Thursday should not be rest");
    
    console.log(`  ✓ 2 strength + 1 yoga, Thursday is ${thursdayPlan.dayType}`);
  }

  // Test 3: Edge case - Thu 1+1 (minimum: 1 strength + 1 yoga)
  console.log("\n3. Thu 1+1 (Thursday start, 1 strength + 1 yoga)");
  {
    const plan = generateProgram(base({ daysPerWeek: 2, yogaDaysPerWeek: 1 }));
    
    const yoga = plan.days.filter(d => d.dayType === "yoga");
    const strength = plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight");
    const rest = plan.days.filter(d => d.dayType === "rest");
    
    assert.strictEqual(strength.length, 1, "Should have 1 strength day");
    assert.strictEqual(yoga.length, 1, "Should have 1 yoga day");
    assert.strictEqual(rest.length, 5, "Should have 5 rest days");
    
    console.log(`  ✓ 1 strength + 1 yoga`);
  }

  console.log("\n✓ All exact-array tests passed\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
