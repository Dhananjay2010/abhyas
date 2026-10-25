/**
 * How much of the catalogue survives the filters, for real user profiles.
 *
 * The generator fills a day's slots by movement pattern. If a pattern has no
 * eligible exercise, the slot is dropped; if *every* slot on a day misses, the
 * day is backfilled with whatever is left. That is how a "Pull" day ends up
 * containing four core exercises. This prints, per profile, how many exercises
 * are eligible and which patterns have nothing at all — the input that decides
 * whether a day can be built honestly.
 *
 * Uses the real `isEligible` and the committed catalogue export.
 *
 *   npx tsx scripts/qa/repro-pools.ts
 */
import { readFileSync } from "node:fs";
import {
  isEligible,
  type CandidateExercise,
  type GeneratorInput,
} from "../../src/lib/program/generate";

const catalogue = JSON.parse(
  readFileSync(process.argv[2] ?? "scripts/fixtures/catalogue.json", "utf8"),
) as CandidateExercise[];

const PATTERNS = [
  "vertical_pull",
  "horizontal_pull",
  "squat",
  "hinge",
  "lunge",
  "calf",
  "biceps",
  "rear_delt",
  "lateral_delt",
  "triceps",
  "horizontal_press",
  "vertical_press",
  "core",
];

function base(over: Partial<GeneratorInput>): GeneratorInput {
  return {
    userId: "00000000-0000-0000-0000-000000000001",
    blockNumber: 1,
    goal: "muscle_gain",
    level: "beginner",
    primaryTrack: "weights",
    daysPerWeek: 6,
    yogaDaysPerWeek: 0,
    age: 30,
    bmi: 25.5,
    hasAllEquipment: true,
    equipmentIds: [],
    currentInjuryRegions: [],
    catalogue,
    ...over,
  };
}

function pools(label: string, over: Partial<GeneratorInput>) {
  const input = base(over);
  const pool = catalogue.filter((e) => isEligible(e, input));
  const by: Record<string, number> = {};
  for (const e of pool) by[e.movement_pattern] = (by[e.movement_pattern] ?? 0) + 1;
  const missing = PATTERNS.filter((p) => !by[p]);
  console.log(`\n${label}`);
  console.log(`  ${pool.length} of ${catalogue.length} eligible`);
  console.log(
    missing.length > 0
      ? `  NOTHING for: ${missing.join(", ")}`
      : "  every pattern covered",
  );
}

pools("gym, everything, beginner", { hasAllEquipment: true });
pools("gym, everything, intermediate", { hasAllEquipment: true, level: "intermediate" });
pools("gym, dumbbells + flat bench, beginner", {
  hasAllEquipment: false,
  equipmentIds: ["dumbbell", "flat_bench"],
});
pools("gym, yoga mat only, beginner", { hasAllEquipment: false, equipmentIds: [] });
pools("home bodyweight, nothing at all, beginner", {
  primaryTrack: "bodyweight",
  hasAllEquipment: false,
  equipmentIds: [],
});
pools("home bodyweight, + pull-up bar, beginner", {
  primaryTrack: "bodyweight",
  hasAllEquipment: false,
  equipmentIds: ["pull_up_bar"],
});
pools("gym, everything, current knee injury", {
  hasAllEquipment: true,
  currentInjuryRegions: ["knee"] as GeneratorInput["currentInjuryRegions"],
});
pools("gym, everything, current shoulder injury", {
  hasAllEquipment: true,
  currentInjuryRegions: ["shoulder"] as GeneratorInput["currentInjuryRegions"],
});
pools("gym, everything, BMI 32", { hasAllEquipment: true, bmi: 32 });
pools("gym, everything, age 55", { hasAllEquipment: true, age: 55 });

// Exercises the app will prescribe in reps that are really timed holds.
const holds = catalogue.filter((e) =>
  /\b(plank|isometric|wall sit|dead hang|bridge|hollow|l-sit|static)\b/i.test(e.name),
);
console.log(
  `\ntimed holds that will be prescribed in reps: ${holds.length}\n  ` +
    holds.map((e) => e.name).join("\n  "),
);
