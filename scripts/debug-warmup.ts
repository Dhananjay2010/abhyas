const { selectWarmup } = require("../src/lib/program/warmup");

const mockWarmups = [
  {
    slug: "walking-lunge",
    type: "mobility",
    target_regions: ["hip"],
    contraindicated_regions: null,
    instructions: ["Walk forward with controlled lunges"],
    equipment_ids: [],
    target_muscles: ["quads", "glutes"],
    id: "mock-1",
    name: "Walking Lunge",
    duration_seconds: 60,
  },
  {
    slug: "skipping-light",
    type: "cardio",
    target_regions: [],
    contraindicated_regions: [],
    instructions: ["Light skipping in place"],
    equipment_ids: [],
    target_muscles: [],
    id: "mock-2",
    name: "Light Skipping",
    duration_seconds: 300,
  },
  {
    slug: "march-in-place",
    type: "cardio",
    target_regions: [],
    contraindicated_regions: [],
    instructions: ["March in place"],
    equipment_ids: [],
    target_muscles: [],
    id: "mock-3",
    name: "March in Place",
    duration_seconds: 300,
  },
  {
    slug: "bodyweight-squat",
    type: "mobility",
    target_regions: [],
    contraindicated_regions: [],
    instructions: ["Squat to full depth maintaining good form"],
    equipment_ids: [],
    target_muscles: ["quads"],
    id: "mock-4",
    name: "Bodyweight Squat",
    duration_seconds: 60,
  },
];

const trainingMuscles = ["quads", "glutes", "hamstrings"];

console.log("Testing with pastKneeInjury: true");
const warmups = selectWarmup({
  warmups: mockWarmups,
  trainingMuscles,
  injuryRegions: [],
  prehabRegions: [],
  track: "weights",
  availableEquipment: new Set(["dumbbell", "kettlebell", "resistance_band"]),
  hasAllEquipment: false,
  pastKneeInjury: true,
});

console.log("Result slugs:", warmups.map(w => w.slug));
console.log("Has walking-lunge:", warmups.some(w => w.slug === "walking-lunge"));
console.log("Has skipping-light:", warmups.some(w => w.slug === "skipping-light"));
