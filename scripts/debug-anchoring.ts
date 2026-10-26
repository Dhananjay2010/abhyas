/**
 * Debug: Inspect generator output for anchored plans
 */

import { generateProgram, type GeneratorInput } from "../src/lib/program/generate";
import { isoWeekday } from "../src/lib/dates";

const MINIMAL_CATALOGUE = [
  { id: "ex1", slug: "barbell-squat", name: "Barbell Squat", movement_pattern: "squat", mechanic: "compound", metric: "reps", primary_muscles: ["quads"], equipment_ids: ["barbell"], level_min: "beginner", contraindicated_regions: [], impact: "medium", spinal_load: "high", tracks: ["weights"], default_rest_seconds: 90, category: "strength" },
  { id: "ex2", slug: "barbell-bench-press", name: "Barbell Bench Press", movement_pattern: "horizontal_press", mechanic: "compound", metric: "reps", primary_muscles: ["chest"], equipment_ids: ["barbell"], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "low", tracks: ["weights"], default_rest_seconds: 90, category: "strength" },
  { id: "ex3", slug: "bent-over-row", name: "Bent Over Row", movement_pattern: "horizontal_pull", mechanic: "compound", metric: "reps", primary_muscles: ["upper_back"], equipment_ids: ["barbell"], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "medium", tracks: ["weights"], default_rest_seconds: 75, category: "strength" },
  { id: "ex4", slug: "deadlift", name: "Deadlift", movement_pattern: "hinge", mechanic: "compound", metric: "reps", primary_muscles: ["hamstrings"], equipment_ids: ["barbell"], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "high", tracks: ["weights"], default_rest_seconds: 180, category: "strength" },
  { id: "ex5", slug: "overhead-press", name: "Overhead Press", movement_pattern: "vertical_press", mechanic: "compound", metric: "reps", primary_muscles: ["shoulders"], equipment_ids: ["barbell"], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "medium", tracks: ["weights"], default_rest_seconds: 90, category: "strength" },
  { id: "ex6", slug: "lat-pulldown", name: "Lat Pulldown", movement_pattern: "vertical_pull", mechanic: "compound", metric: "reps", primary_muscles: ["lats"], equipment_ids: ["cable_machine"], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "none", tracks: ["weights"], default_rest_seconds: 75, category: "strength" },
  { id: "ex7", slug: "plank", name: "Plank", movement_pattern: "core", mechanic: "isolation", metric: "seconds", primary_muscles: ["abs"], equipment_ids: [], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "none", tracks: ["weights", "bodyweight"], default_rest_seconds: 60, category: "strength" },
  { id: "ex8", slug: "lunge", name: "Lunge", movement_pattern: "lunge", mechanic: "compound", metric: "reps", primary_muscles: ["quads"], equipment_ids: [], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "low", tracks: ["weights", "bodyweight"], default_rest_seconds: 75, category: "strength" },
  { id: "ex9", slug: "calf-raise", name: "Calf Raise", movement_pattern: "calf", mechanic: "isolation", metric: "reps", primary_muscles: ["calves"], equipment_ids: [], level_min: "beginner", contraindicated_regions: [], impact: "low", spinal_load: "none", tracks: ["weights", "bodyweight"], default_rest_seconds: 60, category: "strength" },
] as any;

const startedOn = "2026-10-27"; // Tuesday
const weekday = isoWeekday(startedOn);

console.log(`Testing 3-day plan starting ${startedOn} (weekday ${weekday} = Thursday)\n`);

const input: GeneratorInput = {
  userId: "debug-user",
  blockNumber: 1,
  goal: "general_fitness",
  level: "beginner",
  primaryTrack: "weights",
  daysPerWeek: 3,
  yogaDaysPerWeek: 0,
  age: 30,
  bmi: 24,
  hasAllEquipment: true,
  equipmentIds: [],
  currentInjuryRegions: [],
  preferredSessionMinutes: 60,
  catalogue: MINIMAL_CATALOGUE,
  startedOn,
};

const plan = generateProgram(input);

console.log("Generated plan days:");
for (const day of plan.days) {
  const weekdayName = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day.dayIndex];
  const exCount = day.exercises.length;
  console.log(`  Day ${day.dayIndex} (${weekdayName}): ${day.label} (${day.dayType}) - ${exCount} exercises`);
}

console.log("\nTraining days only:");
const training = plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight");
for (const day of training) {
  const weekdayName = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day.dayIndex];
  console.log(`  ${day.label} on ${weekdayName} (dayIndex ${day.dayIndex})`);
}
