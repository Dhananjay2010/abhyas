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
 * (f) Lunge/squat fallback: knee-injured user swapping a lunge gets safe squats
 */

import { rankAlternatives } from "../src/lib/program/alternatives";
import { hashString } from "../src/lib/program/generate";
import type { Database } from "../src/lib/database.types";
import * as fs from "fs";
import * as path from "path";

type TestExerciseRow = {
  id: string;
  name: string;
  slug: string;
  metric: Database["public"]["Enums"]["exercise_metric"];
  movement_pattern: Database["public"]["Enums"]["movement_pattern"];
  mechanic: Database["public"]["Enums"]["mechanic_type"] | null;
  primary_muscles: Database["public"]["Enums"]["muscle"][];
  level_min: Database["public"]["Enums"]["fitness_level"];
  impact: Database["public"]["Enums"]["impact_level"];
  contraindicated_regions: Database["public"]["Enums"]["body_region"][];
  equipment_ids: string[];
  spinal_load: Database["public"]["Enums"]["spinal_load_level"];
  tracks: Database["public"]["Enums"]["track_type"][];
  default_rest_seconds: number;
  category: Database["public"]["Enums"]["exercise_category"];
};

const fixturePath = path.join(__dirname, "fixtures", "prod-catalogue-sample.json");
const rawData = JSON.parse(fs.readFileSync(fixturePath, "utf-8")) as unknown[];

const catalogue = rawData.map((ex: unknown): TestExerciseRow => {
  const e = ex as Record<string, unknown>;
  return {
    id: e.id as string,
    name: e.name as string,
    slug: e.slug as string,
    metric: (e.metric as Database["public"]["Enums"]["exercise_metric"]) ?? "reps",
    movement_pattern: e.movement_pattern as Database["public"]["Enums"]["movement_pattern"],
    mechanic: (e.mechanic as Database["public"]["Enums"]["mechanic_type"]) ?? null,
    primary_muscles: (e.primary_muscles ?? []) as Database["public"]["Enums"]["muscle"][],
    level_min: e.level_min as Database["public"]["Enums"]["fitness_level"],
    impact: e.impact as Database["public"]["Enums"]["impact_level"],
    contraindicated_regions: (e.contraindicated_regions ?? []) as Database["public"]["Enums"]["body_region"][],
    equipment_ids: (e.equipment_ids ?? []) as string[],
    spinal_load: (e.spinal_load as Database["public"]["Enums"]["spinal_load_level"]) ?? "none",
    tracks: (e.tracks ?? []) as Database["public"]["Enums"]["track_type"][],
    default_rest_seconds: (e.default_rest_seconds as number) ?? 60,
    category: (e.category as Database["public"]["Enums"]["exercise_category"]) ?? "other",
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

const dummyScore = () => 0;
const dummyTieBreak = (slug: string) => hashString(slug);

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
      scoreFn: dummyScore,
      tieBreakFn: dummyTieBreak,
    });
    
    const hasPlyoPushup = alternatives.some((e) => e.slug === "plyo-push-up");
    assert(!hasPlyoPushup, "(a) No Plyo Push-up for beginners");
    
    const hasHighImpact = alternatives.some((e) => e.impact === "high");
    assert(!hasHighImpact, "(a) No high-impact exercises for beginners");
    
    const hasWipers = alternatives.some((e) => e.slug === "isometric-wiper");
    assert(!hasWipers, "(a) No Isometric Wipers in horizontal press alternatives");
    
    const pushUpVariants = alternatives.filter((e) => 
      e.name.toLowerCase().includes("push") && e.name.toLowerCase().includes("up")
    );
    assert(pushUpVariants.length <= 1, `(a) At most 1 push-up variant, got ${pushUpVariants.length}`);
    
    assert(alternatives.length <= 5, `(a) Cap at 5, got ${alternatives.length}`);
    
    const allPush = alternatives.every((e) => e.movement_pattern === "horizontal_press");
    assert(allPush, "(a) All alternatives are horizontal_press");
    
    console.log("✅ Test (a): Push-Up Wide beginner case passed");
  }
}

// Test (b): Movement pattern filtering: push never shows pull
{
  const benchPress = catalogue.find((e) => e.slug === "barbell-bench-press");
  
  if (benchPress) {
    const candidates = catalogue;
    
    const alternatives = rankAlternatives(benchPress, candidates, {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      scoreFn: dummyScore,
      tieBreakFn: dummyTieBreak,
    });
    
    const hasPull = alternatives.some((e) => 
      e.movement_pattern === "vertical_pull" || e.movement_pattern === "horizontal_pull"
    );
    assert(!hasPull, "(b) No pull movements in push alternatives");
    
    const allPush = alternatives.every((e) => e.movement_pattern === "horizontal_press");
    assert(allPush, "(b) All alternatives match horizontal_press");
    
    console.log("✅ Test (b): Movement pattern filtering passed");
  }
}

// Test (c): Injury filtering
{
  const shoulderPress = catalogue.find((e) => e.slug.includes("shoulder-press"));
  
  if (shoulderPress) {
    const candidates = catalogue.filter((e) => 
      e.movement_pattern === shoulderPress.movement_pattern
    );
    
    const alternatives = rankAlternatives(shoulderPress, candidates, {
      level: "beginner",
      availableEquipment: null,
      injuryRegions: ["shoulder"],
      scoreFn: dummyScore,
      tieBreakFn: dummyTieBreak,
    });
    
    const hasShoulderContra = alternatives.some((e) => 
      e.contraindicated_regions.includes("shoulder")
    );
    assert(!hasShoulderContra, "(c) No shoulder-contraindicated exercises for shoulder injury");
    
    console.log("✅ Test (c): Injury filtering passed");
  }
}

// Test (d): Equipment all-of filtering
{
  const dumbbellExercise = catalogue.find((e) => 
    e.equipment_ids.length === 1 && e.equipment_ids[0] === "dumbbell"
  );
  
  if (dumbbellExercise) {
    const candidates = catalogue.filter((e) => 
      e.movement_pattern === dumbbellExercise.movement_pattern
    );
    
    const alternatives = rankAlternatives(dumbbellExercise, candidates, {
      level: "intermediate",
      availableEquipment: new Set(["dumbbell"]),
      injuryRegions: [],
      scoreFn: dummyScore,
      tieBreakFn: dummyTieBreak,
    });
    
    const hasBarbell = alternatives.some((e) => 
      e.equipment_ids.includes("barbell") || e.equipment_ids.includes("bench")
    );
    assert(!hasBarbell, "(d) No barbell/bench exercises for dumbbell-only user");
    
    const allValid = alternatives.every((e) => 
      e.equipment_ids.length === 0 || e.equipment_ids.every(id => id === "dumbbell")
    );
    assert(allValid, "(d) All alternatives use only dumbbell or bodyweight");
    
    console.log("✅ Test (d): Equipment all-of filtering passed");
  }
}

// Test (e): Determinism and deduplication
{
  const current = catalogue.find((e) => e.movement_pattern === "horizontal_press");
  
  if (current) {
    const candidates = catalogue.filter((e) => 
      e.movement_pattern === "horizontal_press"
    ).slice(0, 20);
    
    const run1 = rankAlternatives(current, candidates, {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      scoreFn: dummyScore,
      tieBreakFn: dummyTieBreak,
    });
    
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    const run2 = rankAlternatives(current, shuffled, {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      scoreFn: dummyScore,
      tieBreakFn: dummyTieBreak,
    });
    
    const run3 = rankAlternatives(current, candidates, {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      scoreFn: dummyScore,
      tieBreakFn: dummyTieBreak,
    });
    
    assertEqual(run1.length, run2.length, "(e) Same length across shuffled input");
    assertEqual(run1.length, run3.length, "(e) Deterministic across runs");
    
    const slugs1 = run1.map(e => e.slug).join(",");
    const slugs2 = run2.map(e => e.slug).join(",");
    const slugs3 = run3.map(e => e.slug).join(",");
    
    assertEqual(slugs1, slugs2, "(e) Same order regardless of input order");
    assertEqual(slugs1, slugs3, "(e) Stable across runs");
    
    console.log("✅ Test (e): Determinism and deduplication passed");
  }
}

// Test (f): Lunge→squat fallback for knee injury
{
  // Create synthetic test data since the fixture doesn't have squats/lunges
  const barbell_lunge: TestExerciseRow = {
    id: "test-barbell-lunge",
    name: "Barbell Lunge",
    slug: "barbell-lunge",
    metric: "reps",
    movement_pattern: "lunge",
    mechanic: "compound",
    primary_muscles: ["quads"],
    level_min: "intermediate",
    impact: "low",
    contraindicated_regions: ["knee"],
    equipment_ids: ["barbell"],
    spinal_load: "low",
    tracks: ["weights"],
    default_rest_seconds: 90,
    category: "strength",
  };
  
  const walking_lunge: TestExerciseRow = {
    id: "test-walking-lunge",
    name: "Walking Lunge",
    slug: "walking-lunge",
    metric: "reps",
    movement_pattern: "lunge",
    mechanic: "compound",
    primary_muscles: ["quads"],
    level_min: "beginner",
    impact: "low",
    contraindicated_regions: ["knee"],
    equipment_ids: [],
    spinal_load: "none",
    tracks: ["bodyweight"],
    default_rest_seconds: 60,
    category: "strength",
  };
  
  const box_squat: TestExerciseRow = {
    id: "test-box-squat",
    name: "Box Squat",
    slug: "box-squat",
    metric: "reps",
    movement_pattern: "squat",
    mechanic: "compound",
    primary_muscles: ["quads"],
    level_min: "beginner",
    impact: "low",
    contraindicated_regions: [],
    equipment_ids: ["box"],
    spinal_load: "low",
    tracks: ["bodyweight"],
    default_rest_seconds: 90,
    category: "strength",
  };
  
  const wall_sit: TestExerciseRow = {
    id: "test-wall-sit",
    name: "Wall Sit",
    slug: "wall-sit",
    metric: "seconds",
    movement_pattern: "squat",
    mechanic: "isolation",
    primary_muscles: ["quads"],
    level_min: "beginner",
    impact: "low",
    contraindicated_regions: [],
    equipment_ids: [],
    spinal_load: "none",
    tracks: ["bodyweight"],
    default_rest_seconds: 45,
    category: "strength",
  };
  
  const barbell_squat_knee_bad: TestExerciseRow = {
    id: "test-barbell-squat-knee",
    name: "Barbell Squat",
    slug: "barbell-squat",
    metric: "reps",
    movement_pattern: "squat",
    mechanic: "compound",
    primary_muscles: ["quads"],
    level_min: "intermediate",
    impact: "low",
    contraindicated_regions: ["knee"],
    equipment_ids: ["barbell"],
    spinal_load: "high",
    tracks: ["weights"],
    default_rest_seconds: 120,
    category: "strength",
  };
  
  const syntheticCatalogue = [
    barbell_lunge,
    walking_lunge,
    box_squat,
    wall_sit,
    barbell_squat_knee_bad,
  ];
  
  const alternatives = rankAlternatives(barbell_lunge, syntheticCatalogue, {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: ["knee"],
    scoreFn: dummyScore,
    tieBreakFn: dummyTieBreak,
  });
  
  assert(alternatives.length > 0, "(f) Fallback provides alternatives when same-pattern yields empty");
  
  const hasKneeContra = alternatives.some((e) => e.contraindicated_regions.includes("knee"));
  assert(!hasKneeContra, "(f) No knee-contraindicated exercises for knee injury");
  
  const allSquats = alternatives.every((e) => e.movement_pattern === "squat");
  assert(allSquats, "(f) Fallback returned squat alternatives for lunge");
  
  const hasBoxSquat = alternatives.some((e) => e.slug === "box-squat");
  const hasWallSit = alternatives.some((e) => e.slug === "wall-sit");
  assert(hasBoxSquat || hasWallSit, "(f) Returned at least one safe squat option");
  
  console.log("✅ Test (f): Lunge→squat fallback passed");
}

if (failed > 0) {
  console.error(`\n❌ ${failed} test(s) failed`);
  process.exit(1);
} else {
  console.log("\n✅ All tests passed");
  process.exit(0);
}
