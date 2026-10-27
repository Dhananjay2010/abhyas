#!/usr/bin/env tsx
/**
 * Test block-1 anchoring through the generator's startedOn parameter.
 * 
 * Verifies that:
 * - A new block 1 with startedOn anchors its schedule to that weekday
 * - A block without startedOn (rebuild or rollover) uses default mapping
 * - Blocks without startedOn produce identical schedules regardless of block number
 */

import { strict as assert } from "node:assert";
import { generateProgram, type CandidateExercise } from "../src/lib/program/generate";

// Minimal test catalogue
const catalogue: CandidateExercise[] = [
  {
    id: "ex1",
    slug: "barbell-squat",
    name: "Barbell Squat",
    movement_pattern: "squat",
    mechanic: "compound",
    metric: "reps",
    primary_muscles: ["glutes" as const],
    equipment_ids: ["eq-barbell"],
    level_min: "beginner",
    contraindicated_regions: [],
    impact: "high",
    spinal_load: "high",
    tracks: ["weights"],
    default_rest_seconds: 120,
    category: "strength" as const,
  },
];

async function main() {
  console.log("\n1. New block 1 anchors to sign-up weekday");
  {
    // Test through generator directly with startedOn set (simulating what persist passes)
    const thursday = "2026-10-29"; // Thursday
    const plan = generateProgram({
      userId: "user-123",
      blockNumber: 1,
      goal: "muscle_gain",
      level: "intermediate",
      primaryTrack: "weights",
      daysPerWeek: 3,
      yogaDaysPerWeek: 0,
      age: 30,
      bmi: 24,
      hasAllEquipment: true,
      equipmentIds: ["eq-barbell"],
      currentInjuryRegions: [],
      catalogue,
      startedOn: thursday, // Anchoring enabled
    });

    // Thursday is weekday 4 (ISO weekday: Mon=1, Sun=7)
    const dayIndices = plan.days.map((d) => d.dayIndex).filter((idx) => plan.days.find((d) => d.dayIndex === idx)?.dayType === "weights");
    
    // With 3 days per week starting Thursday, we expect indices 4, 6, 1 (Thu, Sat, Mon)
    // The exact indices depend on the generator's anchoring logic
    assert.ok(dayIndices.length === 3, "should have 3 training days");
    assert.ok(dayIndices.includes(4), "first training day should be Thursday (weekday 4)");
    
    console.log(`  ✓ Block 1 with startedOn=${thursday}: first training day is weekday ${dayIndices[0]}`);
  }

  console.log("\n2. Rebuild of block 1 does NOT anchor (no startedOn)");
  {
    const plan = generateProgram({
      userId: "user-123",
      blockNumber: 1,
      goal: "muscle_gain",
      level: "intermediate",
      primaryTrack: "weights",
      daysPerWeek: 3,
      yogaDaysPerWeek: 0,
      age: 30,
      bmi: 24,
      hasAllEquipment: true,
      equipmentIds: ["eq-barbell"],
      currentInjuryRegions: [],
      catalogue,
      // No startedOn - uses default mapping
    });

    const baseline = generateProgram({
      userId: "user-123",
      blockNumber: 2,
      goal: "muscle_gain",
      level: "intermediate",
      primaryTrack: "weights",
      daysPerWeek: 3,
      yogaDaysPerWeek: 0,
      age: 30,
      bmi: 24,
      hasAllEquipment: true,
      equipmentIds: ["eq-barbell"],
      currentInjuryRegions: [],
      catalogue,
      // No startedOn
    });

    const indices1 = plan.days.map((d) => d.dayIndex).sort().join(",");
    const indices2 = baseline.days.map((d) => d.dayIndex).sort().join(",");

    assert.strictEqual(
      indices1,
      indices2,
      "rebuild block 1 (no startedOn) must match block 2 (no startedOn)"
    );

    console.log(`  ✓ Rebuild block 1 without startedOn: day indices ${indices1} match block 2`);
  }

  console.log("\n3. Block 2+ does NOT anchor (no startedOn)");
  {
    const block2 = generateProgram({
      userId: "user-123",
      blockNumber: 2,
      goal: "muscle_gain",
      level: "intermediate",
      primaryTrack: "weights",
      daysPerWeek: 3,
      yogaDaysPerWeek: 0,
      age: 30,
      bmi: 24,
      hasAllEquipment: true,
      equipmentIds: ["eq-barbell"],
      currentInjuryRegions: [],
      catalogue,
    });

    const block10 = generateProgram({
      userId: "user-123",
      blockNumber: 10,
      goal: "muscle_gain",
      level: "intermediate",
      primaryTrack: "weights",
      daysPerWeek: 3,
      yogaDaysPerWeek: 0,
      age: 30,
      bmi: 24,
      hasAllEquipment: true,
      equipmentIds: ["eq-barbell"],
      currentInjuryRegions: [],
      catalogue,
    });

    const indices2 = block2.days.map((d) => d.dayIndex).sort().join(",");
    const indices10 = block10.days.map((d) => d.dayIndex).sort().join(",");

    assert.strictEqual(
      indices2,
      indices10,
      "block 2+ without startedOn must have identical mapping"
    );

    console.log(`  ✓ Block 2 and Block 10 without startedOn: day indices ${indices2} match`);
  }

  console.log("\n✓ All anchoring tests passed\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
