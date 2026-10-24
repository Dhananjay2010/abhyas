import { evaluateProgression, type ExerciseMeta } from "../src/lib/program/progression";

const META = (mechanic: "compound" | "isolation"): ExerciseMeta => ({
  mechanic,
  metric: "reps",
  movementPattern: "horizontal_press",
  isBodyweight: false,
  progressionChain: null,
  progressionRank: null,
});

const fresh = (w: number) => ({ currentWorkingWeightKg: w, currentTargetReps: 12, consecutiveFailures: 0, bestWeightKg: w, bestReps: 12, bestE1rm: w * 1.4, totalSessions: 3 });
const miss = (w: number) => Array.from({ length: 4 }, () => ({ reps: 5, weightKg: w }));

const cases = [
  { name: "Barbell 40kg", weight: 40, eq: ["barbell"], mechanic: "compound" as const },
  { name: "Dumbbell 5kg isolation", weight: 5, eq: ["dumbbell"], mechanic: "isolation" as const },
  { name: "Kettlebell 16kg", weight: 16, eq: ["kettlebell"], mechanic: "compound" as const },
  { name: "Cable 40kg", weight: 40, eq: ["cable_machine"], mechanic: "compound" as const },
  { name: "Lat pulldown 60kg", weight: 60, eq: ["lat_pulldown"], mechanic: "compound" as const },
  { name: "Leg extension 30kg iso", weight: 30, eq: ["leg_extension"], mechanic: "isolation" as const },
  { name: "Medicine ball 4kg", weight: 4, eq: ["medicine_ball"], mechanic: "compound" as const },
];

console.log("| Equipment | First Miss | Second Miss |");
console.log("|-----------|------------|-------------|");

for (const c of cases) {
  const r1 = evaluateProgression({ sets: miss(c.weight), plannedSets: 4, repsMin: 6, repsMax: 8, feel: "right", meta: META(c.mechanic), state: fresh(c.weight), isDeload: false, equipmentIds: c.eq, unit: "kg" });
  const r2 = evaluateProgression({ sets: miss(c.weight), plannedSets: 4, repsMin: 6, repsMax: 8, feel: "right", meta: META(c.mechanic), state: {...fresh(c.weight), consecutiveFailures: 1}, isDeload: false, equipmentIds: c.eq, unit: "kg" });
  console.log(`| ${c.name} | ${c.weight} → ${r1.nextWorkingWeightKg} | ${c.weight} → ${r2.nextWorkingWeightKg} (${r2.outcome}) |`);
}
