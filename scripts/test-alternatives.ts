#!/usr/bin/env tsx

/**
 * Test exercise alternative ranking and filtering.
 * 
 * Tests:
 * (a) Push-Up Wide beginner case: no plyometric, no isometric wipers, no duplicates
 * (b) Movement pattern filtering: push exercises never show pulls
 * (c) Injury filtering
 * (d) Equipment all-of: dumbbell-only user gets no barbell/bench moves
 * (e) Determinism: same output across runs and input orders
 */

import { rankAlternatives } from "../src/lib/program/alternatives";
import type { Database } from "../src/lib/database.types";

// Type for our test data - matches the ExerciseRow type in alternatives.ts
type TestExerciseRow = {
  id: string;
  name: string;
  slug: string;
  cue: string | null;
  metric: Database["public"]["Enums"]["exercise_metric"];
  movement_pattern: Database["public"]["Enums"]["movement_pattern"];
  primary_muscles: Database["public"]["Enums"]["muscle"][];
  level_min: Database["public"]["Enums"]["fitness_level"];
  impact: Database["public"]["Enums"]["impact_level"];
  contraindicated_regions: Database["public"]["Enums"]["body_region"][];
  equipment_ids: string[];
};

// Load fixture
import * as fs from "fs";
import * as path from "path";

const fixturePath = path.join(__dirname, "fixtures", "prod-catalogue-sample.json");
const rawData = JSON.parse(fs.readFileSync(fixturePath, "utf-8")) as unknown[];

const catalogue = rawData.map((ex: unknown): TestExerciseRow => {
  const e = ex as Record<string, unknown>;
  return {
    id: e.id as string,
    name: e.name as string,
    slug: e.slug as string,
    cue: (e.cue as string | null) ?? null,
    metric: (e.metric as Database["public"]["Enums"]["exercise_metric"]) ?? "reps",
    movement_pattern: e.movement_pattern as Database["public"]["Enums"]["movement_pattern"],
    primary_muscles: (e.primary_muscles ?? []) as Database["public"]["Enums"]["muscle"][],
    level_min: e.level_min as Database["public"]["Enums"]["fitness_level"],
    impact: e.impact as Database["public"]["Enums"]["impact_level"],
    contraindicated_regions: (e.contraindicated_regions ?? []) as Database["public"]["Enums"]["body_region"][],
    equipment_ids: (e.equipment_ids ?? []) as string[],
  };
});

let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    console.error(`❌ FAIL: ${message}`);
    console.error(`  Expected: ${expected}`);
    console.error(`  Actual:   ${actual}`);
    failed++;
  }
}

// Test (a): Push-Up Wide beginner case
{
  const pushUpWide = catalogue.find((e) => e.slug === "push-up-wide");
  assert(!!pushUpWide, "Push-Up Wide exists in fixture");
  
  if (pushUpWide) {
    const candidates = catalogue.filter(
      (e) => e.movement_pattern === "horizontal_press"
    );
    
    const alternatives = rankAlternatives(pushUpWide, candidates, {
      level: "beginner",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
    });
    
    // No plyometric
    const hasPlyoPushup = alternatives.some((e) => e.slug === "plyo-push-up");
    assert(!hasPlyoPushup, "(a) No Plyo Push-up for beginners");
    
    // No high-impact at all
    const hasHighImpact = alternatives.some((e) => e.impact === "high");
    assert(!hasHighImpact, "(a) No high-impact exercises for beginners");
    
    // No Isometric Wipers (not a horizontal press)
    const hasWipers = alternatives.some((e) => e.slug === "isometric-wiper");
    assert(!hasWipers, "(a) No Isometric Wipers in horizontal press alternatives");
    
    // No duplicates (check for near-duplicate push-ups)
    const pushUpVariants = alternatives.filter((e) => 
      e.name.toLowerCase().includes("push") && e.name.toLowerCase().includes("up")
    );
    // Should have at most 1 push-up variant due to deduplication
    assert(pushUpVariants.length <= 1, `(a) At most 1 push-up variant, got ${pushUpVariants.length}`);
    
    // All are push pattern
    const allPush = alternatives.every((e) => e.movement_pattern === "horizontal_press");
    assert(allPush, "(a) All alternatives are horizontal_press");
    
    // Respects limit
    assert(alternatives.length <= 5, `(a) Results capped at 5, got ${alternatives.length}`);
    
    console.log(`✅ Test (a): Push-Up Wide beginner case - ${alternatives.length} alternatives`);
  }
}

// Test (b): Push exercises never show pull exercises
{
  const pushExercise = catalogue.find((e) => 
    e.movement_pattern === "horizontal_press"
  );
  
  if (pushExercise) {
    // Include both push and pull in candidates
    const candidates = catalogue.filter(
      (e) => e.movement_pattern === "horizontal_press" || e.movement_pattern === "horizontal_pull"
    );
    
    const alternatives = rankAlternatives(pushExercise, candidates, {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
    });
    
    const hasPull = alternatives.some((e) => e.movement_pattern === "horizontal_pull");
    assert(!hasPull, "(b) Push exercise alternatives contain no pull movements");
    
    console.log(`✅ Test (b): Movement pattern filtering`);
  } else {
    console.log(`⚠️  Test (b): Skipped - no horizontal press exercise found`);
  }
}

// Test (c): Injury filtering
{
  const shoulderPress = catalogue.find((e) => 
    e.contraindicated_regions.includes("shoulder")
  );
  
  if (shoulderPress) {
    const candidates = catalogue.filter(
      (e) => e.movement_pattern === shoulderPress.movement_pattern
    );
    
    const alternatives = rankAlternatives(shoulderPress, candidates, {
      level: "beginner",
      availableEquipment: null,
      injuryRegions: ["shoulder"],
    });
    
    // None should contraindicate shoulder
    const hasShoulderContra = alternatives.some((e) => 
      e.contraindicated_regions.includes("shoulder")
    );
    assert(!hasShoulderContra, "(c) No exercises contraindicated for shoulder injury");
    
    console.log(`✅ Test (c): Injury filtering`);
  }
}

// Test (d): Equipment all-of semantics
{
  const barbellExercise = catalogue.find((e) => 
    e.equipment_ids.length > 0 && 
    e.equipment_ids.some(id => id.includes("barbell"))
  );
  
  if (barbellExercise) {
    const candidates = catalogue.filter(
      (e) => e.movement_pattern === barbellExercise.movement_pattern
    );
    
    // User only has dumbbells
    const dumbbellId = "dumbbell"; // simplified for test
    const alternatives = rankAlternatives(barbellExercise, candidates, {
      level: "intermediate",
      availableEquipment: new Set([dumbbellId]),
      injuryRegions: [],
    });
    
    // Should have bodyweight or dumbbell-only exercises
    const allMatchEquipment = alternatives.every((e) => 
      e.equipment_ids.length === 0 || // bodyweight
      e.equipment_ids.every(id => id === dumbbellId) // dumbbell-only
    );
    assert(allMatchEquipment, "(d) Equipment filtering: only bodyweight or available equipment");
    
    // Should NOT have barbell or bench exercises
    const hasBarbellOrBench = alternatives.some((e) => 
      e.equipment_ids.some(id => id.includes("barbell") || id.includes("bench"))
    );
    assert(!hasBarbellOrBench, "(d) No barbell or bench exercises for dumbbell-only user");
    
    console.log(`✅ Test (d): Equipment all-of filtering`);
  }
}

// Test (e): Determinism
{
  const exercise = catalogue.find((e) => e.movement_pattern === "horizontal_press");
  
  if (exercise) {
    const candidates = catalogue.filter(
      (e) => e.movement_pattern === "horizontal_press"
    );
    
    const ctx = {
      level: "intermediate" as const,
      availableEquipment: null,
      injuryRegions: [] as Database["public"]["Enums"]["body_region"][],
    };
    
    const run1 = rankAlternatives(exercise, candidates, ctx);
    const run2 = rankAlternatives(exercise, candidates, ctx);
    
    assertEqual(run1.length, run2.length, "(e) Same length across runs");
    
    for (let i = 0; i < run1.length; i++) {
      assertEqual(run1[i].id, run2[i].id, `(e) Same exercise at index ${i}`);
    }
    
    // Test with shuffled candidates
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    const run3 = rankAlternatives(exercise, shuffled, ctx);
    
    assertEqual(run1.length, run3.length, "(e) Same length with shuffled input");
    
    for (let i = 0; i < run1.length; i++) {
      assertEqual(run1[i].id, run3[i].id, `(e) Same exercise at index ${i} with shuffled input`);
    }
    
    console.log(`✅ Test (e): Determinism across runs and input orders`);
  }
}

// Summary
if (failed === 0) {
  console.log("\n✅ All alternative ranking tests passed");
  process.exit(0);
} else {
  console.error(`\n❌ ${failed} test(s) failed`);
  process.exit(1);
}
