/**
 * Probe: find profiles that generate excluded exercises on origin/main.
 * 
 * Searches across injury sets, equipment, days, minutes, levels, goals
 * to find which configurations produce neck-press, guillotine-press, 
 * low-pulley-row-to-neck, standing-barbell-press-behind-neck,
 * wide-grip-pulldown-behind-the-neck, wide-grip-rear-pull-up.
 */

import { generateProgram, type CandidateExercise, type GeneratorInput } from "../src/lib/program/generate";
import { readFileSync } from "fs";

const catalogue: CandidateExercise[] = JSON.parse(readFileSync(__dirname + "/fixtures/catalogue.json", "utf-8"));

const EXCLUDED_SLUGS = [
  "neck-press",
  "barbell-guillotine-bench-press",
  "low-pulley-row-to-neck",
  "standing-barbell-press-behind-neck",
  "wide-grip-pulldown-behind-the-neck",
  "wide-grip-rear-pull-up",
];

const idToSlug = new Map(catalogue.map(e => [e.id, e.slug]));

const EQUIPMENT_PROFILES = {
  "full-gym": { ids: [] as string[], hasAll: true },
  "barbell-bench": { ids: ["barbell", "squat_rack", "flat_bench"], hasAll: false },
  "dumbbells-bench": { ids: ["dumbbell", "flat_bench"], hasAll: false },
  "cable-machine": { ids: ["cable_machine"], hasAll: false },
  "bodyweight": { ids: [] as string[], hasAll: false },
};

type BodyRegion = "lower_back" | "neck" | "shoulder" | "elbow" | "wrist" | "upper_back" | "hip" | "knee" | "ankle" | "core";

const INJURY_SETS: BodyRegion[][] = [
  [],
  ["shoulder"],
  ["neck"],
  ["knee"],
  ["lower_back"],
  ["shoulder", "knee"],
];

const LEVELS: Array<"beginner" | "intermediate" | "expert"> = ["beginner", "intermediate", "expert"];
const GOALS: Array<"muscle_gain" | "strength"> = ["muscle_gain", "strength"];
const DAYS = [2, 3, 4, 5, 6];
const MINUTES = [30, 45, 60, 75, 90];

type ProfileHit = {
  equipment: string;
  injuries: string[];
  level: string;
  goal: string;
  days: number;
  minutes: number;
  slug: string;
};

const hits: ProfileHit[] = [];
let count = 0;

for (const [equipmentName, { ids, hasAll }] of Object.entries(EQUIPMENT_PROFILES)) {
  for (const injuries of INJURY_SETS) {
    for (const level of LEVELS) {
      for (const goal of GOALS) {
        for (const days of DAYS) {
          for (const minutes of MINUTES) {
            count++;
            
            const input: GeneratorInput = {
              userId: `probe-${count}`,
              blockNumber: 1,
              level,
              equipmentIds: ids,
              hasAllEquipment: hasAll,
              goal,
              currentInjuryRegions: injuries,
              age: null,
              bmi: null,
              daysPerWeek: days,
              yogaDaysPerWeek: 0,
              primaryTrack: equipmentName === "bodyweight" ? "bodyweight" : "weights",
              preferredSessionMinutes: minutes,
              catalogue,
            };
            
            const program = generateProgram(input);
            const exerciseIds = program.days.flatMap(d => d.exercises.map(e => e.exerciseId));
            const slugs = exerciseIds.map(id => idToSlug.get(id)).filter(Boolean);
            
            for (const slug of slugs) {
              if (EXCLUDED_SLUGS.includes(slug!)) {
                hits.push({
                  equipment: equipmentName,
                  injuries,
                  level,
                  goal,
                  days,
                  minutes,
                  slug: slug!,
                });
              }
            }
          }
        }
      }
    }
  }
}

console.log(`Probed ${count} profiles`);
console.log(`\nFound ${hits.length} hits:`);

const bySlug = new Map<string, ProfileHit[]>();
for (const hit of hits) {
  if (!bySlug.has(hit.slug)) bySlug.set(hit.slug, []);
  bySlug.get(hit.slug)!.push(hit);
}

for (const slug of EXCLUDED_SLUGS) {
  const profiles = bySlug.get(slug) || [];
  console.log(`\n${slug}: ${profiles.length} profile(s)`);
  if (profiles.length > 0) {
    const example = profiles[0];
    console.log(`  Example: ${example.equipment}, injuries=[${example.injuries.join(",")}], ${example.level}, ${example.goal}, ${example.days}d, ${example.minutes}min`);
  }
}
