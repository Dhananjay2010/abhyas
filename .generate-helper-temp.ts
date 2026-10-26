
import { generateProgram } from "./src/lib/program/generate";
import { CATALOGUE } from "./src/lib/program/catalogue";
import { readFileSync, writeFileSync } from "fs";

const profiles = JSON.parse(readFileSync(process.argv[2], "utf8"));
const outputPath = process.argv[3];

const results: any[] = [];

for (const profile of profiles) {
  const program = generateProgram({
    experience: profile.experience,
    equipment: profile.equipment,
    split: profile.split,
    weekday: profile.weekday,
    currentKneeInjury: false,
    pastKneeInjury: true,
    currentLowerBackInjury: false,
    pastLowerBackInjury: false,
    currentShoulderInjury: false,
    pastShoulderInjury: false,
  });

  const exercises: any[] = [];
  for (let dayIdx = 0; dayIdx < program.days.length; dayIdx++) {
    const day = program.days[dayIdx];
    if (day.type === "rest") continue;

    for (let slotIdx = 0; slotIdx < day.slots.length; slotIdx++) {
      const slot = day.slots[slotIdx];
      exercises.push({
        day: dayIdx,
        slot: slotIdx,
        slug: slot.exercise_slug,
        sets: slot.sets,
        reps: slot.reps,
        rest: slot.rest_seconds,
        warmup: slot.warmup_drills || [],
      });
    }
  }

  results.push({
    profile,
    exercises,
  });
}

writeFileSync(outputPath, JSON.stringify(results, null, 2));
console.log(`Generated ${results.length} profiles`);
