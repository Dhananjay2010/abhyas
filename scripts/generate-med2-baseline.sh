#!/bin/bash
set -e

# Generate MED-2 baseline from origin/main for PR #152 follow-up comparison
# This script runs the real generator at origin/main in a temporary git worktree

echo "=== Generating MED-2 baseline from origin/main ==="

# Create temporary worktree
WORKTREE_DIR=$(mktemp -d)
trap "rm -rf $WORKTREE_DIR" EXIT

echo "Creating worktree at $WORKTREE_DIR..."
git worktree add --detach "$WORKTREE_DIR" origin/main

# Install dependencies in worktree
echo "Installing dependencies..."
cd "$WORKTREE_DIR"
npm install --silent 2>&1 | grep -v "^npm warn" || true

# Generate the baseline
echo "Generating past-knee program at origin/main..."
npx tsx -e '
import { writeFileSync } from "fs";
import { readFileSync } from "fs";
import {
  generateProgram,
  estimateSessionMinutes,
  type CandidateExercise,
  type GeneratorInput,
} from "./src/lib/program/generate.ts";

const catalogue = JSON.parse(
  readFileSync("scripts/fixtures/catalogue.json", "utf-8")
) as CandidateExercise[];

const pastKneeInput: GeneratorInput = {
  userId: "test-med2-comparison",
  blockNumber: 1,
  goal: "muscle_gain",
  level: "intermediate",
  primaryTrack: "weights",
  daysPerWeek: 4,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 23,
  hasAllEquipment: true,
  equipmentIds: [],
  currentInjuryRegions: [],
  anyKneeInjury: true,
  preferredSessionMinutes: 75,
  catalogue,
};

const result = generateProgram(pastKneeInput);

// Extract Lower and Full Body days
const lowerDays = result.days.filter(day => 
  day.focus === "lower" || day.focus === "legs" || day.focus === "full_body"
);

// Compute metrics for each day
const lowerBodyPatterns = new Set(["squat", "lunge", "hinge", "calf"]);
const catalogueById = new Map(catalogue.map(ex => [ex.id, ex]));

const baseline = lowerDays.map(day => {
  const exercises = day.exercises.map(ex => {
    const exData = catalogueById.get(ex.exerciseId);
    return { ...ex, exData };
  }).filter(e => e.exData !== undefined);
  
  const lowerBodySets = exercises
    .filter(e => e.exData && lowerBodyPatterns.has(e.exData.movement_pattern))
    .reduce((sum, e) => sum + e.targetSets, 0);
  
  const totalSets = exercises.reduce((sum, e) => sum + e.targetSets, 0);
  const estMinutes = Math.round(estimateSessionMinutes({ exercises: day.exercises }));
  
  return {
    dayIndex: day.dayIndex,
    label: day.label,
    focus: day.focus,
    lowerBodySets,
    totalSets,
    estMinutes,
    exercises: exercises.map(e => ({
      name: e.name,
      slug: e.exData?.slug,
      targetSets: e.targetSets,
      movementPattern: e.exData?.movement_pattern,
    })),
  };
});

console.log("Generated baseline:");
baseline.forEach(day => {
  console.log(`  Day ${day.dayIndex} (${day.label}): ${day.lowerBodySets} lower sets, ${day.estMinutes} min`);
});

writeFileSync(
  "med2-baseline-main.json",
  JSON.stringify(baseline, null, 2)
);

console.log("\\nBaseline written to med2-baseline-main.json");
'

# Move baseline back to main repo
cd -
mv "$WORKTREE_DIR/med2-baseline-main.json" scripts/fixtures/

echo ""
echo "✓ MED-2 baseline generated at scripts/fixtures/med2-baseline-main.json"
echo ""
echo "Baseline contents:"
cat scripts/fixtures/med2-baseline-main.json | head -50

# Cleanup
git worktree remove "$WORKTREE_DIR"
