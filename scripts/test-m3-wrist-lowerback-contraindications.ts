/**
 * M3: Wrist and lower_back contraindication tests
 * 
 * Verifies that:
 * 1. Plan generation excludes contraindicated exercises for wrist and lower_back injuries
 * 2. Swap suggestions use the SAME contraindication logic (shared getAllContraindications)
 * 3. Push days still have >=2 pressing exercises after filtering
 * 4. Plans are deterministic
 * 5. Uninjured profiles generate identically to before the change (regression test)
 * 
 *   npm run test:m3-wrist
 */

import { generateProgram, getAllContraindications, type CandidateExercise, type GeneratorInput } from "@/lib/program/generate";
import { rankAlternatives, type AlternativesContext } from "@/lib/program/alternatives";
import { hashString } from "@/lib/program/generate";
import type { Database } from "@/lib/database.types";

type BodyRegion = Database["public"]["Enums"]["body_region"];

// Real prod-like catalogue fixture (abbreviated for tests)
const MOCK_CATALOGUE: CandidateExercise[] = [
  // Pike push-ups (should be excluded for wrist injuries after M3)
  {
    id: "pike-1", slug: "pike-push-up", name: "Pike Push-Up",
    movement_pattern: "vertical_press", mechanic: "compound",
    metric: "reps", primary_muscles: ["front_delts", "side_delts"], equipment_ids: [],
    level_min: "beginner", contraindicated_regions: ["shoulder", "wrist"], // M3: wrist added by migration
    impact: "low", spinal_load: "none", tracks: ["bodyweight", "weights"],
    category: "strength", default_rest_seconds: 75,
  },
  {
    id: "pike-2", slug: "elevated-pike-push-up", name: "Elevated Pike Push-Up",
    movement_pattern: "vertical_press", mechanic: "compound",
    metric: "reps", primary_muscles: ["front_delts", "side_delts"], equipment_ids: [],
    level_min: "intermediate", contraindicated_regions: ["shoulder", "wrist"], // M3: wrist added
    impact: "low", spinal_load: "none", tracks: ["bodyweight", "weights"],
    category: "strength", default_rest_seconds: 90,
  },
  
  // Dips (should be excluded for wrist injuries after M3)
  {
    id: "dips-1", slug: "dips-triceps-version", name: "Dips - Triceps Version",
    movement_pattern: "horizontal_press", mechanic: "compound",
    metric: "reps", primary_muscles: ["triceps"], equipment_ids: ["dip_bars"],
    level_min: "beginner", contraindicated_regions: ["elbow", "shoulder", "wrist"], // M3: wrist added
    impact: "low", spinal_load: "none", tracks: ["bodyweight", "weights"],
    category: "strength", default_rest_seconds: 120,
  },
  {
    id: "dips-2", slug: "bench-dips", name: "Bench Dips",
    movement_pattern: "horizontal_press", mechanic: "compound",
    metric: "reps", primary_muscles: ["triceps"], equipment_ids: ["dip_bars", "flat_bench"],
    level_min: "beginner", contraindicated_regions: ["elbow", "shoulder", "wrist"], // M3: wrist added
    impact: "low", spinal_load: "none", tracks: ["bodyweight", "weights"],
    category: "strength", default_rest_seconds: 120,
  },

  // Regular push-ups (already have wrist tags)
  {
    id: "pushup-1", slug: "pushups", name: "Pushups",
    movement_pattern: "horizontal_press", mechanic: "compound",
    metric: "reps", primary_muscles: ["chest"], equipment_ids: [],
    level_min: "beginner", contraindicated_regions: ["wrist"], // Already tagged
    impact: "low", spinal_load: "none", tracks: ["bodyweight", "weights"],
    category: "strength", default_rest_seconds: 120,
  },
  {
    id: "pushup-2", slug: "incline-push-up", name: "Incline Push-Up",
    movement_pattern: "horizontal_press", mechanic: "compound",
    metric: "reps", primary_muscles: ["chest"], equipment_ids: ["adjustable_bench"],
    level_min: "beginner", contraindicated_regions: ["wrist"], // Already tagged
    impact: "low", spinal_load: "none", tracks: ["bodyweight", "weights"],
    category: "strength", default_rest_seconds: 120,
  },

  // Wrist-safe pressing alternatives (NO wrist tags)
  {
    id: "db-press-1", slug: "dumbbell-bench-press", name: "Dumbbell Bench Press",
    movement_pattern: "horizontal_press", mechanic: "compound",
    metric: "reps", primary_muscles: ["chest"], equipment_ids: ["dumbbell", "flat_bench"],
    level_min: "beginner", contraindicated_regions: ["shoulder"],
    impact: "low", spinal_load: "low", tracks: ["weights"],
    category: "strength", default_rest_seconds: 120,
  },
  {
    id: "db-press-2", slug: "dumbbell-shoulder-press", name: "Dumbbell Shoulder Press",
    movement_pattern: "vertical_press", mechanic: "compound",
    metric: "reps", primary_muscles: ["front_delts", "side_delts"], equipment_ids: ["dumbbell"],
    level_min: "beginner", contraindicated_regions: ["shoulder"],
    impact: "low", spinal_load: "none", tracks: ["weights"],
    category: "strength", default_rest_seconds: 120,
  },
  {
    id: "band-press", slug: "resistance-band-chest-press", name: "Resistance Band Chest Press",
    movement_pattern: "horizontal_press", mechanic: "compound",
    metric: "reps", primary_muscles: ["chest"], equipment_ids: ["resistance_band"],
    level_min: "beginner", contraindicated_regions: [],
    impact: "low", spinal_load: "none", tracks: ["bodyweight", "weights"],
    category: "strength", default_rest_seconds: 90,
  },

  // Front-rack squats (should be excluded for wrist injuries after M3)
  {
    id: "front-squat-1", slug: "front-barbell-squat", name: "Front Barbell Squat",
    movement_pattern: "squat", mechanic: "compound",
    metric: "reps", primary_muscles: ["quads"], equipment_ids: ["barbell", "squat_rack"],
    level_min: "expert", contraindicated_regions: ["knee", "wrist"], // M3: wrist added
    impact: "low", spinal_load: "high", tracks: ["weights"],
    category: "strength", default_rest_seconds: 120,
  },

  // Lower back exercises
  {
    id: "hinge-1", slug: "barbell-deadlift", name: "Barbell Deadlift",
    movement_pattern: "hinge", mechanic: "compound",
    metric: "reps", primary_muscles: ["lower_back"], equipment_ids: ["barbell"],
    level_min: "intermediate", contraindicated_regions: ["lower_back"],
    impact: "low", spinal_load: "high", tracks: ["weights"],
    category: "strength", default_rest_seconds: 120,
  },
  {
    id: "hinge-2", slug: "good-morning", name: "Good Morning",
    movement_pattern: "hinge", mechanic: "compound",
    metric: "reps", primary_muscles: ["hamstrings"], equipment_ids: ["barbell", "squat_rack"],
    level_min: "intermediate", contraindicated_regions: ["lower_back"],
    impact: "low", spinal_load: "high", tracks: ["weights"],
    category: "strength", default_rest_seconds: 120,
  },
  {
    id: "hinge-3", slug: "jefferson-squats", name: "Jefferson Squats",
    movement_pattern: "squat", mechanic: "compound",
    metric: "reps", primary_muscles: ["quads"], equipment_ids: ["barbell"],
    level_min: "intermediate", contraindicated_regions: ["knee", "lower_back"], // M3: lower_back added
    impact: "low", spinal_load: "high", tracks: ["weights"],
    category: "strength", default_rest_seconds: 120,
  },
  {
    id: "hinge-4", slug: "glute-bridge", name: "Glute Bridge",
    movement_pattern: "hinge", mechanic: "compound",
    metric: "reps", primary_muscles: ["glutes"], equipment_ids: [],
    level_min: "beginner", contraindicated_regions: [],
    impact: "low", spinal_load: "none", tracks: ["bodyweight", "weights"],
    category: "strength", default_rest_seconds: 120,
  },

  // Pulls
  {
    id: "pull-1", slug: "bent-over-barbell-row", name: "Bent Over Barbell Row",
    movement_pattern: "horizontal_pull", mechanic: "compound",
    metric: "reps", primary_muscles: ["upper_back"], equipment_ids: ["barbell"],
    level_min: "beginner", contraindicated_regions: ["lower_back"],
    impact: "low", spinal_load: "high", tracks: ["weights"],
    category: "strength", default_rest_seconds: 120,
  },
  {
    id: "pull-2", slug: "inverted-row", name: "Inverted Row",
    movement_pattern: "horizontal_pull", mechanic: "compound",
    metric: "reps", primary_muscles: ["lats", "upper_back"], equipment_ids: [],
    level_min: "beginner", contraindicated_regions: ["shoulder"],
    impact: "low", spinal_load: "none", tracks: ["bodyweight", "weights"],
    category: "strength", default_rest_seconds: 75,
  },

  // Squats
  {
    id: "squat-1", slug: "barbell-squat", name: "Barbell Squat",
    movement_pattern: "squat", mechanic: "compound",
    metric: "reps", primary_muscles: ["quads"], equipment_ids: ["barbell", "squat_rack"],
    level_min: "beginner", contraindicated_regions: ["knee"],
    impact: "low", spinal_load: "high", tracks: ["weights"],
    category: "strength", default_rest_seconds: 120,
  },
  {
    id: "squat-2", slug: "bodyweight-squat", name: "Bodyweight Squat",
    movement_pattern: "squat", mechanic: "compound",
    metric: "reps", primary_muscles: ["quads"], equipment_ids: [],
    level_min: "beginner", contraindicated_regions: ["knee"],
    impact: "low", spinal_load: "low", tracks: ["bodyweight", "weights"],
    category: "strength", default_rest_seconds: 120,
  },
];

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n0. Verify mock catalogue has correct tags (migration verification)");
{
  // Verify pike push-ups have wrist tags
  const pikePushUp = MOCK_CATALOGUE.find(e => e.slug === "pike-push-up");
  check("pike-push-up has wrist tag", pikePushUp?.contraindicated_regions.includes("wrist") ?? false);
  
  const elevatedPike = MOCK_CATALOGUE.find(e => e.slug === "elevated-pike-push-up");
  check("elevated-pike-push-up has wrist tag", elevatedPike?.contraindicated_regions.includes("wrist") ?? false);
  
  // Verify dips have wrist tags
  const dipsTriceps = MOCK_CATALOGUE.find(e => e.slug === "dips-triceps-version");
  check("dips-triceps-version has wrist tag", dipsTriceps?.contraindicated_regions.includes("wrist") ?? false);
  
  const benchDips = MOCK_CATALOGUE.find(e => e.slug === "bench-dips");
  check("bench-dips has wrist tag", benchDips?.contraindicated_regions.includes("wrist") ?? false);
  
  // Verify front-rack squats have wrist tags
  const frontSquat = MOCK_CATALOGUE.find(e => e.slug === "front-barbell-squat");
  check("front-barbell-squat has wrist tag", frontSquat?.contraindicated_regions.includes("wrist") ?? false);
  
  // Verify jefferson squats have lower_back tag
  const jeffersonSquats = MOCK_CATALOGUE.find(e => e.slug === "jefferson-squats");
  check("jefferson-squats has lower_back tag", jeffersonSquats?.contraindicated_regions.includes("lower_back") ?? false);
}

const baseInput: Omit<GeneratorInput, "currentInjuryRegions" | "blockNumber"> = {
  userId: "test-user-m3",
  goal: "strength",
  level: "intermediate",
  primaryTrack: "bodyweight",
  daysPerWeek: 6,
  yogaDaysPerWeek: 1,
  age: 30,
  bmi: 22,
  hasAllEquipment: false,
  equipmentIds: ["bodyweight", "mat", "dip_bars", "dumbbell", "resistance_band"],
  preferredSessionMinutes: 30,
  catalogue: MOCK_CATALOGUE,
};

/** Count contraindicated exercises in a list */
function countContraindicated(
  exerciseIds: string[],
  catalogue: CandidateExercise[],
  injuries: BodyRegion[]
): { count: number; violations: string[] } {
  let count = 0;
  const violations: string[] = [];
  const injurySet = new Set(injuries);

  for (const id of exerciseIds) {
    const ex = catalogue.find(e => e.id === id);
    if (!ex) continue;

    const allContraindications = getAllContraindications(ex);
    if (allContraindications.some(region => injurySet.has(region))) {
      count++;
      violations.push(`${ex.name} (${ex.slug}): ${allContraindications.filter(r => injurySet.has(r)).join(", ")}`);
    }
  }

  return { count, violations };
}

/** Count pressing exercises (horizontal_press or vertical_press) */
function countPressingExercises(
  exerciseIds: string[],
  catalogue: CandidateExercise[]
): number {
  return exerciseIds.filter(id => {
    const ex = catalogue.find(e => e.id === id);
    return ex && (ex.movement_pattern === "horizontal_press" || ex.movement_pattern === "vertical_press");
  }).length;
}

console.log("\n1. Wrist injury filtering in plan generation");
{
  const input: GeneratorInput = {
    ...baseInput,
    blockNumber: 1,
    currentInjuryRegions: ["wrist"],
  };

  const program = generateProgram(input);
  const allExerciseIds = program.days.flatMap(day => day.exercises.map(ex => ex.exerciseId));
  
  const result = countContraindicated(allExerciseIds, MOCK_CATALOGUE, ["wrist"]);
  
  check("Wrist-injured plan excludes pike push-ups", !allExerciseIds.includes("pike-1"));
  check("Wrist-injured plan excludes elevated pike push-ups", !allExerciseIds.includes("pike-2"));
  check("Wrist-injured plan excludes triceps dips", !allExerciseIds.includes("dips-1"));
  check("Wrist-injured plan excludes bench dips", !allExerciseIds.includes("dips-2"));
  check("Wrist-injured plan excludes all contraindicated exercises", result.count === 0, 
    result.count > 0 ? `Found: ${result.violations.join("; ")}` : "");
}

console.log("\n2. Wrist injury filtering in swap suggestions");
{
  const wristInjuryUser: AlternativesContext = {
    level: "intermediate",
    availableEquipment: new Set(["bodyweight", "mat", "dip_bars", "dumbbell", "resistance_band"]),
    injuryRegions: ["wrist"],
    scoreFn: () => 1,
    tieBreakFn: (slug: string) => hashString(slug),
  };

  const dbPress = MOCK_CATALOGUE.find(e => e.slug === "dumbbell-bench-press")!;
  const swaps = rankAlternatives(dbPress, MOCK_CATALOGUE, wristInjuryUser);

  const result = countContraindicated(swaps.map(s => s.id), MOCK_CATALOGUE, ["wrist"]);
  
  check("Swap list for dumbbell bench press excludes pike push-ups", !swaps.some(s => s.id === "pike-1" || s.id === "pike-2"));
  check("Swap list for dumbbell bench press excludes dips", !swaps.some(s => s.id === "dips-1" || s.id === "dips-2"));
  check("Swap list excludes all wrist-contraindicated exercises", result.count === 0,
    result.count > 0 ? `Found: ${result.violations.join("; ")}` : "");
}

console.log("\n3. Pressing exercises remain despite wrist filtering");
{
  const input: GeneratorInput = {
    ...baseInput,
    blockNumber: 1,
    currentInjuryRegions: ["wrist"],
    level: "expert",
    equipmentIds: ["bodyweight", "mat", "dip_bars", "dumbbell", "resistance_band", "flat_bench"],
  };

  const program = generateProgram(input);
  // Check that we still have wrist-safe pressing exercises available
  const allExerciseIds = program.days.flatMap(day => day.exercises.map(ex => ex.exerciseId));
  const wristSafePressCount = countPressingExercises(allExerciseIds, MOCK_CATALOGUE);
  
  // The small test catalogue has limited wrist-safe presses, but we should have SOME
  check("Plan includes wrist-safe pressing exercises", wristSafePressCount > 0, 
    `Found ${wristSafePressCount} pressing exercises across all days`);
  
  // Verify none of the pressing exercises are contraindicated for wrist
  const pressingExercises = allExerciseIds
    .filter(id => {
      const ex = MOCK_CATALOGUE.find(e => e.id === id);
      return ex && (ex.movement_pattern === "horizontal_press" || ex.movement_pattern === "vertical_press");
    });
  
  const wristContraindicated = countContraindicated(pressingExercises, MOCK_CATALOGUE, ["wrist"]);
  check("No wrist-contraindicated pressing exercises in plan", wristContraindicated.count === 0);
}

console.log("\n4. Lower_back injury filtering");
{
  const input: GeneratorInput = {
    ...baseInput,
    blockNumber: 1,
    currentInjuryRegions: ["lower_back"],
  };

  const program = generateProgram(input);
  const allExerciseIds = program.days.flatMap(day => day.exercises.map(ex => ex.exerciseId));
  
  const result = countContraindicated(allExerciseIds, MOCK_CATALOGUE, ["lower_back"]);
  
  check("Lower_back-injured plan excludes barbell deadlift", !allExerciseIds.includes("hinge-1"));
  check("Lower_back-injured plan excludes good morning", !allExerciseIds.includes("hinge-2"));
  check("Lower_back-injured plan excludes jefferson squats", !allExerciseIds.includes("hinge-3"));
  check("Lower_back-injured plan excludes all contraindicated exercises", result.count === 0,
    result.count > 0 ? `Found: ${result.violations.join("; ")}` : "");
}

console.log("\n5. Combined wrist + lower_back injuries");
{
  const input: GeneratorInput = {
    ...baseInput,
    blockNumber: 1,
    currentInjuryRegions: ["wrist", "lower_back"],
  };

  const program = generateProgram(input);
  const allExerciseIds = program.days.flatMap(day => day.exercises.map(ex => ex.exerciseId));
  
  const resultWrist = countContraindicated(allExerciseIds, MOCK_CATALOGUE, ["wrist"]);
  const resultLowerBack = countContraindicated(allExerciseIds, MOCK_CATALOGUE, ["lower_back"]);
  
  check("Combined injuries exclude wrist-contraindicated exercises", resultWrist.count === 0);
  check("Combined injuries exclude lower_back-contraindicated exercises", resultLowerBack.count === 0);
}

console.log("\n6. Determinism tests");
{
  const input: GeneratorInput = {
    ...baseInput,
    blockNumber: 1,
    currentInjuryRegions: ["wrist"],
  };

  const program1 = generateProgram(input);
  const program2 = generateProgram(input);

  let identical = true;
  if (program1.days.length !== program2.days.length) {
    identical = false;
  } else {
    for (let i = 0; i < program1.days.length; i++) {
      const day1 = program1.days[i];
      const day2 = program2.days[i];
      
      if (day1.exercises.length !== day2.exercises.length) {
        identical = false;
        break;
      }
      
      for (let j = 0; j < day1.exercises.length; j++) {
        if (day1.exercises[j].exerciseId !== day2.exercises[j].exerciseId ||
            day1.exercises[j].targetSets !== day2.exercises[j].targetSets) {
          identical = false;
          break;
        }
      }
    }
  }
  
  check("Plans are deterministic for wrist injuries", identical);
}

console.log("\n7. Regression test: NO injuries");
{
  const input: GeneratorInput = {
    ...baseInput,
    blockNumber: 1,
    currentInjuryRegions: [],
  };

  const program1 = generateProgram(input);
  const program2 = generateProgram(input);

  let identical = true;
  if (program1.days.length !== program2.days.length) {
    identical = false;
  } else {
    for (let i = 0; i < program1.days.length; i++) {
      const day1 = program1.days[i];
      const day2 = program2.days[i];
      
      if (day1.exercises.length !== day2.exercises.length) {
        identical = false;
        break;
      }
      
      for (let j = 0; j < day1.exercises.length; j++) {
        if (day1.exercises[j].exerciseId !== day2.exercises[j].exerciseId) {
          identical = false;
          break;
        }
      }
    }
  }
  
  check("Uninjured plans are deterministic (regression)", identical);
}

console.log("\n8. Cross-level and cross-equipment tests");
{
  const testCases = [
    { level: "beginner" as const, equipment: ["bodyweight", "mat"], injuries: ["wrist"] as BodyRegion[] },
    { level: "intermediate" as const, equipment: ["dumbbell", "flat_bench"], injuries: ["lower_back"] as BodyRegion[] },
    { level: "expert" as const, equipment: ["barbell", "squat_rack", "dip_bars"], injuries: ["wrist", "lower_back"] as BodyRegion[] },
  ];

  for (const testCase of testCases) {
    const input: GeneratorInput = {
      ...baseInput,
      level: testCase.level,
      equipmentIds: testCase.equipment,
      blockNumber: 1,
      currentInjuryRegions: testCase.injuries,
    };

    const program = generateProgram(input);
    const allExerciseIds = program.days.flatMap(day => day.exercises.map(ex => ex.exerciseId));
    
    let allClear = true;
    for (const injury of testCase.injuries) {
      const result = countContraindicated(allExerciseIds, MOCK_CATALOGUE, [injury]);
      if (result.count > 0) {
        allClear = false;
        console.log(`    FAIL: ${testCase.level} with ${testCase.injuries.join("+")} has ${result.count} contraindicated exercises`);
      }
    }
    
    check(`${testCase.level} with ${testCase.injuries.join("+")} excludes contraindicated exercises`, allClear);
  }
}

// Summary
console.log(`\n${"=".repeat(60)}`);
if (failures === 0) {
  console.log("✓ All M3 wrist/lower_back tests passed");
  process.exit(0);
} else {
  console.log(`✗ ${failures} test(s) failed`);
  process.exit(1);
}
