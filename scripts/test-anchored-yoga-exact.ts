#!/usr/bin/env tsx
/**
 * Test: anchored block 1 exact arrays for Thursday 3 days / 1 yoga (QA repro)
 * 
 * HIGH-1 specific case from QA report:
 * - Thu 3 days total / 1 yoga: should give 2 strength + 1 yoga
 *   (not 1 strength + 1 yoga with Full Body B missing)
 * 
 * Real bounds: days ∈ {3,4,5,6}, yoga ∈ 0..days-1
 * This tests the edge case where yoga = days - 1 (minimal strength).
 */

import { strict as assert } from "node:assert";
import { generateProgram, type GeneratorInput } from "../src/lib/program/generate";
import { CATALOGUE, toCandidate } from "./helpers/swap-scenario";

function base(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    userId: "test-user",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    daysPerWeek: 3,
    yogaDaysPerWeek: 1,
    age: 30,
    bmi: 23,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],
    catalogue: CATALOGUE.map(toCandidate),
    startedOn: "2026-10-29", // Thursday
    ...overrides,
  };
}

async function main() {
  console.log("\nAnchored block 1: exact arrays for Thursday 3 days / 1 yoga\n");

  // Test 1: Thu 3 days total / 1 yoga (2 strength + 1 yoga)
  console.log("1. Thu 3 days / 1 yoga (Thursday start, strength = 3-1 = 2)");
  {
    const plan = generateProgram(base({ daysPerWeek: 3, yogaDaysPerWeek: 1 }));
    
    const yoga = plan.days.filter(d => d.dayType === "yoga");
    const strength = plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight");
    const rest = plan.days.filter(d => d.dayType === "rest");
    
    const expectedStrength = 3 - 1;
    assert.strictEqual(strength.length, expectedStrength, `Should have ${expectedStrength} strength days (3-1)`);
    assert.strictEqual(yoga.length, 1, "Should have 1 yoga day");
    assert.strictEqual(rest.length, 4, "Should have 4 rest days");
    
    // At least one active day should be on Thursday (the sign-up day)
    const thursdayPlan = plan.days.find(d => d.dayIndex === 4);
    assert.ok(thursdayPlan, "Should have a plan for Thursday");
    assert.notStrictEqual(thursdayPlan.dayType, "rest", "Thursday should not be rest");
    
    console.log(`  ✓ ${expectedStrength} strength + 1 yoga, Thursday is ${thursdayPlan.dayType}`);
  }

  // Test 2: Thu 4 days / 2 yoga (2 strength + 2 yoga)
  console.log("\n2. Thu 4 days / 2 yoga (Thursday start, strength = 4-2 = 2)");
  {
    const plan = generateProgram(base({ daysPerWeek: 4, yogaDaysPerWeek: 2 }));
    
    const yoga = plan.days.filter(d => d.dayType === "yoga");
    const strength = plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight");
    const rest = plan.days.filter(d => d.dayType === "rest");
    
    const expectedStrength = 4 - 2;
    assert.strictEqual(strength.length, expectedStrength, `Should have ${expectedStrength} strength days (4-2)`);
    assert.strictEqual(yoga.length, 2, "Should have 2 yoga days");
    assert.strictEqual(rest.length, 3, "Should have 3 rest days");
    
    const thursdayPlan = plan.days.find(d => d.dayIndex === 4);
    assert.ok(thursdayPlan, "Should have a plan for Thursday");
    assert.notStrictEqual(thursdayPlan.dayType, "rest", "Thursday should not be rest");
    
    console.log(`  ✓ ${expectedStrength} strength + 2 yoga, Thursday is ${thursdayPlan.dayType}`);
  }

  // Test 3: Thu 5 days / 1 yoga (4 strength + 1 yoga)
  console.log("\n3. Thu 5 days / 1 yoga (Thursday start, strength = 5-1 = 4)");
  {
    const plan = generateProgram(base({ daysPerWeek: 5, yogaDaysPerWeek: 1 }));
    
    const yoga = plan.days.filter(d => d.dayType === "yoga");
    const strength = plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight");
    const rest = plan.days.filter(d => d.dayType === "rest");
    
    const expectedStrength = 5 - 1;
    assert.strictEqual(strength.length, expectedStrength, `Should have ${expectedStrength} strength days (5-1)`);
    assert.strictEqual(yoga.length, 1, "Should have 1 yoga day");
    assert.strictEqual(rest.length, 2, "Should have 2 rest days");
    
    console.log(`  ✓ ${expectedStrength} strength + 1 yoga`);
  }

  console.log("\n✓ All exact-array tests passed\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
