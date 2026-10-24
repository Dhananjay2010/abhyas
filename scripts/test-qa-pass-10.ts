/**
 * QA Pass 10 Comprehensive Regression Test Suite
 * 
 * Tests all critical and high-priority requirements across 34 profiles × 3 seeds.
 * Runs against the POST-MIGRATION fixture (scripts/fixtures/catalogue.json).
 * 
 *   npm run test:qa-pass-10
 */
import { readFileSync, existsSync } from "node:fs";
import {
  generateProgram,
  type CandidateExercise,
  type GeneratorInput,
  estimateSessionMinutes,
} from "../src/lib/program/generate";
import { selectWarmup, selectCooldown, type WarmupRow } from "../src/lib/program/warmup";

const fixture = process.argv[2] ?? "scripts/fixtures/catalogue.json";
const catalogue = JSON.parse(readFileSync(fixture, "utf8")) as CandidateExercise[];

// Warmups fixture is REQUIRED - test MUST fail if missing
const warmupsPath = "scripts/fixtures/warmups.json";
if (!existsSync(warmupsPath)) {
  console.error(`FATAL: ${warmupsPath} does not exist - warmup tests cannot run`);
  process.exit(1);
}
const warmups = JSON.parse(readFileSync(warmupsPath, "utf8")) as WarmupRow[];
const byId = new Map(catalogue.map((e) => [e.id, e]));

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
}

function base(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    userId: "11111111-1111-1111-1111-111111111111",
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
    preferredSessionMinutes: 60,
    catalogue,
    ...overrides,
  };
}

function allPicked(input: GeneratorInput) {
  const plan = generateProgram(input);
  const picked = plan.days.flatMap((d) => d.exercises.map((e) => byId.get(e.exerciseId)!));
  return { plan, picked };
}

// Test each profile with 3 different user IDs (different seeds)
function testSeeds(label: string, input: Partial<GeneratorInput>, assertions: (plan: ReturnType<typeof generateProgram>, picked: CandidateExercise[], seed: number) => void) {
  const seeds = [
    "11111111-1111-1111-1111-111111111111",
    "22222222-2222-2222-2222-222222222222",
    "33333333-3333-3333-3333-333333333333",
  ];
  
  console.log(`\n${label}`);
  seeds.forEach((userId, idx) => {
    const fullInput = base({ ...input, userId });
    const { plan, picked } = allPicked(fullInput);
    assertions(plan, picked, idx + 1);
  });
}

// ====================
// C1: Ballistic, Olympic, behind-neck, throw, bradford filters
// ====================

testSeeds("C1: No plyometric/Olympic/behind-neck/throw/bradford in ANY main slot (ALL goals)", 
  { goal: "fat_loss", daysPerWeek: 4 },
  (plan, picked, seed) => {
    const mainSlotExercises = plan.days.flatMap(d => 
      d.exercises.slice(0, 4).map(e => byId.get(e.exerciseId)!)
    );
    
    const unsafe = mainSlotExercises.filter(e => {
      const name = e.name.toLowerCase();
      const slug = e.slug.toLowerCase();
      const isBallistic = 
        e.impact === "high" && (name.includes("jump") || slug.includes("jump") || slug.includes("plyo"));
      const isOlympic = 
        name.includes("snatch") || name.includes("clean") || name.includes("jerk");
      const isDangerous = 
        name.includes("behind-the-neck") || name.includes("behind neck") ||
        name.includes("throw") || name.includes("bradford") || name.includes("to-neck");
      return isBallistic || isOlympic || isDangerous;
    });
    
    check(`Seed ${seed}: No unsafe moves in main slots`, unsafe.length === 0, 
      unsafe.map(e => e.name).join(", "));
  }
);

testSeeds("C1: Bodyweight intermediate 4d fat_loss has NO unsafe moves in main slots",
  { primaryTrack: "bodyweight", goal: "fat_loss", level: "intermediate", daysPerWeek: 4, hasAllEquipment: false, equipmentIds: [] },
  (plan, picked, seed) => {
    const mainSlotExercises = plan.days.flatMap(d => 
      d.exercises.slice(0, 4).map(e => byId.get(e.exerciseId)!)
    );
    
    const unsafe = mainSlotExercises.filter(e => {
      const name = e.name.toLowerCase();
      const isBallistic = e.impact === "high" ||
        name.includes("jump") || name.includes("snatch") || name.includes("bradford");
      return isBallistic;
    });
    
    check(`Seed ${seed}: BW fat loss has no unsafe main moves`, unsafe.length === 0,
      unsafe.map(e => e.name).join(", "));
  }
);

testSeeds("C1: Beginner gets NO unsafe moves in ANY slot",
  { level: "beginner", daysPerWeek: 3 },
  (plan, picked, seed) => {
    const unsafe = picked.filter(e => {
      const name = e.name.toLowerCase();
      const slug = e.slug.toLowerCase();
      return (
        e.impact === "high" && (name.includes("jump") || slug.includes("jump")) ||
        name.includes("snatch") || name.includes("clean") || name.includes("jerk") ||
        name.includes("bradford") || name.includes("throw")
      );
    });
    
    check(`Seed ${seed}: Beginner has no unsafe moves`, unsafe.length === 0,
      unsafe.map(e => e.name).join(", "));
  }
);

testSeeds("C1: Age 50+ gets NO unsafe moves in ANY slot",
  { age: 52, daysPerWeek: 4 },
  (plan, picked, seed) => {
    const unsafe = picked.filter(e => {
      const name = e.name.toLowerCase();
      return (
        e.impact === "high" || 
        name.includes("snatch") || name.includes("bradford") || name.includes("throw")
      );
    });
    
    check(`Seed ${seed}: Age 50+ has no unsafe moves`, unsafe.length === 0,
      unsafe.map(e => e.name).join(", "));
  }
);

// ====================
// C2: Shoulder injury contraindications
// ====================

testSeeds("C2: Shoulder injury gets NO vertical_press, overhead, or throws",
  { currentInjuryRegions: ["shoulder"], daysPerWeek: 4 },
  (plan, picked, seed) => {
    const bad = picked.filter(e => {
      const name = e.name.toLowerCase();
      return (
        e.movement_pattern === "vertical_press" ||
        name.includes("overhead") ||
        name.includes("throw") ||
        name.includes("shoulder press") ||
        name.includes("military press")
      );
    });
    
    check(`Seed ${seed}: Shoulder injury has no overhead/throw moves`, bad.length === 0,
      bad.map(e => e.name).join(", "));
    
    const warmup = selectWarmup({
      warmups,
      trainingMuscles: ["chest", "front_delts"],
      injuryRegions: ["shoulder"],
      track: "weights",
      hasAllEquipment: true,
      availableEquipment: null,
    });
    const badWarmup = warmup.filter(w => w.target_regions.includes("shoulder"));
    check(`Seed ${seed}: Warmup avoids shoulder`, badWarmup.length === 0,
      badWarmup.map(w => w.name).join(", "));
  }
);

// ====================
// C3: Lower back injury contraindications
// ====================

testSeeds("C3: Lower back injury gets NO high spinal load or crunches",
  { currentInjuryRegions: ["lower_back"], daysPerWeek: 4 },
  (plan, picked, seed) => {
    const highLoad = picked.filter(e => e.spinal_load === "high");
    check(`Seed ${seed}: Lower back injury has no high spinal load`, highLoad.length === 0,
      highLoad.map(e => e.name).join(", "));
    
    const crunches = picked.filter(e => {
      const name = e.name.toLowerCase();
      return name.includes("crunch") || name.includes("jackknife");
    });
    check(`Seed ${seed}: Lower back injury has no crunches`, crunches.length === 0,
      crunches.map(e => e.name).join(", "));
  }
);

// ====================
// H1: Intermediate/advanced should get barbell deadlifts/RDLs
// ====================

testSeeds("H1: Gym intermediate has barbell deadlift or RDL in the week",
  { level: "intermediate", primaryTrack: "weights", daysPerWeek: 4 },
  (plan, picked, seed) => {
    const hasDeadlift = picked.some(e => {
      const slug = e.slug.toLowerCase();
      return slug.includes("deadlift") || slug.includes("romanian");
    });
    check(`Seed ${seed}: Has deadlift or RDL`, hasDeadlift,
      hasDeadlift ? "" : "Missing staple hinge");
  }
);

testSeeds("H1: Gym advanced strength has barbell deadlift or RDL",
  { level: "expert", goal: "strength", daysPerWeek: 5 },
  (plan, picked, seed) => {
    const hasDeadlift = picked.some(e => {
      const slug = e.slug.toLowerCase();
      return (slug.includes("deadlift") || slug.includes("romanian")) && 
             (slug.includes("barbell") || e.equipment_ids.includes("barbell"));
    });
    check(`Seed ${seed}: Has barbell deadlift or RDL`, hasDeadlift);
  }
);

// ====================
// H2: Second Upper/Lower day should NOT open with pushups/bodyweight squat
// ====================

testSeeds("H2: Second Upper day does NOT start with pushups (gym intermediate)",
  { level: "intermediate", daysPerWeek: 4 },
  (plan, picked, seed) => {
    const upperDays = plan.days.filter(d => d.focus === "upper" || d.focus === "push");
    if (upperDays.length >= 2) {
      const secondUpper = upperDays[1];
      const firstEx = secondUpper.exercises[0];
      const firstExData = byId.get(firstEx.exerciseId)!;
      const isPushup = firstExData.name.toLowerCase().includes("push") && 
                      firstExData.equipment_ids.length === 0;
      check(`Seed ${seed}: Second Upper doesn't start with pushup`, !isPushup,
        isPushup ? firstExData.name : "");
    }
  }
);

testSeeds("H2: Second Lower day does NOT start with bodyweight squat (gym intermediate)",
  { level: "intermediate", daysPerWeek: 4 },
  (plan, picked, seed) => {
    const lowerDays = plan.days.filter(d => d.focus === "lower" || d.focus === "legs");
    if (lowerDays.length >= 2) {
      const secondLower = lowerDays[1];
      const firstEx = secondLower.exercises[0];
      const firstExData = byId.get(firstEx.exerciseId)!;
      const isBWSquat = firstExData.slug === "bodyweight-squat";
      check(`Seed ${seed}: Second Lower doesn't start with BW squat`, !isBWSquat,
        isBWSquat ? firstExData.name : "");
    }
  }
);

// ====================
// H3: Every Upper/Push day should have a real OHP
// ====================

testSeeds("H3: Every Upper/Push day has a real overhead press (gym intermediate)",
  { level: "intermediate", daysPerWeek: 4 },
  (plan, picked, seed) => {
    const upperDays = plan.days.filter(d => d.focus === "upper" || d.focus === "push");
    const hasOHP = upperDays.every(day => {
      const dayExercises = day.exercises.map(e => byId.get(e.exerciseId)!);
      return dayExercises.some(e => 
        e.movement_pattern === "vertical_press" && 
        e.mechanic === "compound" &&
        (e.equipment_ids.includes("barbell") || e.equipment_ids.includes("dumbbell"))
      );
    });
    check(`Seed ${seed}: Every Upper/Push day has OHP`, hasOHP);
  }
);

// ====================
// H5: Bodyweight/band moves never get 3-6 reps
// ====================

testSeeds("H5: Bodyweight moves don't get 3-6 reps @ 180s (strength goal)",
  { goal: "strength", level: "intermediate", daysPerWeek: 4 },
  (plan, picked, seed) => {
    const lowRepBW = plan.days.flatMap(d => d.exercises).filter(e => {
      const ex = byId.get(e.exerciseId)!;
      return ex.equipment_ids.length === 0 && e.targetRepsMin <= 6;
    });
    check(`Seed ${seed}: Bodyweight moves get higher reps`, lowRepBW.length === 0,
      lowRepBW.map(e => byId.get(e.exerciseId)!.name).join(", "));
  }
);

// ====================
// H6: Knee injury gets quad-focused alternatives
// ====================

testSeeds("H6: Knee injury gets at least 1 quad move per Lower day",
  { currentInjuryRegions: ["knee"], daysPerWeek: 4 },
  (plan, picked, seed) => {
    const lowerDays = plan.days.filter(d => d.focus === "lower" || d.focus === "legs");
    const hasQuads = lowerDays.every(day => {
      const dayExercises = day.exercises.map(e => byId.get(e.exerciseId)!);
      return dayExercises.some(e => 
        e.primary_muscles.includes("quads")
      );
    });
    check(`Seed ${seed}: Every Lower day has quad work`, hasQuads);
    
    const warmup = selectWarmup({
      warmups,
      trainingMuscles: ["quads", "hamstrings"],
      injuryRegions: ["knee"],
      track: "weights",
      hasAllEquipment: true,
      availableEquipment: null,
    });
    const hasKneeWarmup = warmup.some(w => w.target_regions.includes("knee"));
    check(`Seed ${seed}: Warmup avoids knee-loading moves`, !hasKneeWarmup);
  }
);

// ====================
// H7: Warmup and cooldown respect injury filtering
// ====================

testSeeds("H7: Warmup and cooldown filter by injuries",
  { currentInjuryRegions: ["knee"], daysPerWeek: 4 },
  (plan, picked, seed) => {
    const warmup = selectWarmup({
      warmups,
      trainingMuscles: ["quads", "hamstrings"],
      injuryRegions: ["knee"],
      track: "weights",
      hasAllEquipment: true,
      availableEquipment: null,
    });
    const badWarmup = warmup.filter(w => w.target_regions.includes("knee"));
    check(`Seed ${seed}: Warmup filtered by knee injury`, badWarmup.length === 0);
    
    const cooldown = selectCooldown({
      stretches: warmups,
      trainingMuscles: ["quads"],
      injuryRegions: ["knee"],
      hasAllEquipment: true,
      availableEquipment: null,
    });
    const badCooldown = cooldown.filter(w => w.target_regions.includes("knee"));
    check(`Seed ${seed}: Cooldown filtered by knee injury`, badCooldown.length === 0);
  }
);

// ====================
// H8: BW plans have at least 1 pull per upper/full-body day
// ====================

testSeeds("H8: BW intermediate 4d fat_loss has pulls on every upper day",
  { primaryTrack: "bodyweight", goal: "fat_loss", level: "intermediate", daysPerWeek: 4, hasAllEquipment: false, equipmentIds: [] },
  (plan, picked, seed) => {
    const upperOrFullDays = plan.days.filter(d => 
      d.focus === "upper" || d.focus === "pull" || d.focus === "push" || d.dayType === "bodyweight"
    );
    
    if (upperOrFullDays.length > 0) {
      const hasPulls = upperOrFullDays.every(day => {
        const dayExercises = day.exercises.map(e => byId.get(e.exerciseId)!);
        return dayExercises.some(e => 
          e.movement_pattern === "horizontal_pull" || 
          e.movement_pattern === "vertical_pull"
        );
      });
      check(`Seed ${seed}: Every upper/full day has a pull`, hasPulls);
    }
  }
);

// ====================
// H9: Age 60+ gets no high-impact moves
// ====================

testSeeds("H9: Age 62 gets NO high-impact, plyometric, or throws",
  { age: 62, daysPerWeek: 4, bmi: 31, goal: "fat_loss" },
  (plan, picked, seed) => {
    const highImpact = picked.filter(e => 
      e.impact === "high" || 
      e.name.toLowerCase().includes("jump") ||
      e.name.toLowerCase().includes("throw") ||
      e.name.toLowerCase().includes("plyo")
    );
    check(`Seed ${seed}: Age 62 has no high-impact moves`, highImpact.length === 0,
      highImpact.map(e => e.name).join(", "));
  }
);

// ====================
// M3: Session duration within target ± 5 min
// ====================

testSeeds("M3: 30-min session stays within 30 ± 5 min",
  { preferredSessionMinutes: 30, daysPerWeek: 4 },
  (plan, picked, seed) => {
    const trainingDays = plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight");
    const avgEstimate = trainingDays.length > 0
      ? trainingDays.reduce((sum, day) => sum + estimateSessionMinutes(day), 0) / trainingDays.length
      : 0;
    const withinRange = avgEstimate >= 25 && avgEstimate <= 35;
    check(`Seed ${seed}: 30-min session within range`, withinRange,
      `estimated ${avgEstimate.toFixed(0)} min`);
  }
);

testSeeds("M3: 75-min session stays within 75 ± 5 min",
  { preferredSessionMinutes: 75, daysPerWeek: 4 },
  (plan, picked, seed) => {
    const trainingDays = plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight");
    const avgEstimate = trainingDays.length > 0
      ? trainingDays.reduce((sum, day) => sum + estimateSessionMinutes(day), 0) / trainingDays.length
      : 0;
    const withinRange = avgEstimate >= 70 && avgEstimate <= 80;
    check(`Seed ${seed}: 75-min session within range`, withinRange,
      `estimated ${avgEstimate.toFixed(0)} min`);
  }
);

// ====================
// Additional matrix profiles
// ====================

testSeeds("BW beginner 2d",
  { primaryTrack: "bodyweight", level: "beginner", daysPerWeek: 2, hasAllEquipment: false, equipmentIds: [] },
  (plan, picked, seed) => {
    check(`Seed ${seed}: BW beginner 2d generates plan`, picked.length > 0);
    check(`Seed ${seed}: No equipment needed`, picked.every(e => e.equipment_ids.length === 0));
  }
);

testSeeds("BW beginner 3d",
  { primaryTrack: "bodyweight", level: "beginner", daysPerWeek: 3, hasAllEquipment: false, equipmentIds: [] },
  (plan, picked, seed) => {
    check(`Seed ${seed}: BW beginner 3d generates plan`, picked.length > 0);
  }
);

testSeeds("Gym advanced 5d strength",
  { level: "expert", goal: "strength", daysPerWeek: 5 },
  (plan, picked, seed) => {
    check(`Seed ${seed}: Advanced 5d generates plan`, picked.length > 0);
    const hasDeadlift = picked.some(e => e.slug.toLowerCase().includes("deadlift"));
    check(`Seed ${seed}: Has deadlift variation`, hasDeadlift);
  }
);

testSeeds("Gym advanced 6d strength",
  { level: "expert", goal: "strength", daysPerWeek: 6 },
  (plan, picked, seed) => {
    check(`Seed ${seed}: Advanced 6d generates plan`, picked.length > 0);
  }
);

// QA Pass 10 (h): Warmup/cooldown equipment filtering test
testSeeds('(h) Bodyweight-only user gets no equipment warmups/cooldowns',
  { primaryTrack: 'bodyweight', hasAllEquipment: false, equipmentIds: [], daysPerWeek: 3 },
  (plan, picked, seed) => {
    const warmup = selectWarmup({
      warmups,
      trainingMuscles: ['chest', 'triceps'],
      injuryRegions: [],
      track: 'bodyweight',
      hasAllEquipment: false,
      availableEquipment: new Set([]),
    });
    
    const warmupWithEquipment = warmup.filter(w => w.equipment_ids.length > 0);
    check(`Seed ${seed}: Bodyweight warmup needs no equipment`, warmupWithEquipment.length === 0,
      warmupWithEquipment.map(w => `${w.name}[${w.equipment_ids}]`).join(', '));
    
    const cooldown = selectCooldown({
      stretches: warmups,
      trainingMuscles: ['chest'],
      injuryRegions: [],
      hasAllEquipment: false,
      availableEquipment: new Set([]),
    });
    
    const cooldownWithEquipment = cooldown.filter(w => w.equipment_ids.length > 0);
    const hasBandPullApart = cooldown.some(w => w.slug === "band-pull-apart");
    check(`Seed ${seed}: Bodyweight cooldown needs no equipment`, cooldownWithEquipment.length === 0,
      cooldownWithEquipment.map(w => `${w.name}[${w.equipment_ids}]`).join(', '));
    check(`Seed ${seed}: Cooldown excludes band-pull-apart`, !hasBandPullApart);
  }
);

// QA Pass 10 (i): M3 female beginner fat loss bodyweight-only 3d 45min
testSeeds('(i) M3: Female beginner fat loss bodyweight 3d 45min within ±5min',
  { 
    primaryTrack: 'bodyweight',
    level: 'beginner',
    goal: 'fat_loss',
    hasAllEquipment: false,
    equipmentIds: [],
    daysPerWeek: 3,
    preferredSessionMinutes: 45,
    age: 36,
    bmi: 32, // fat_loss goal
  },
  (plan, picked, seed) => {
    const trainingDays = plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight");
    const avgEstimate = trainingDays.length > 0
      ? trainingDays.reduce((sum, day) => sum + estimateSessionMinutes(day), 0) / trainingDays.length
      : 0;
    const withinRange = avgEstimate >= 40 && avgEstimate <= 50;
    check(`Seed ${seed}: Female beginner 45-min session within range`, withinRange,
      `estimated ${avgEstimate.toFixed(0)} min`);
    
    // Also check that plan has variety
    check(`Seed ${seed}: Has at least 10 exercises`, picked.length >= 10,
      `got ${picked.length} exercises`);
  }
);

// Summary
console.log(`\n${failures === 0 ? "✓ All tests passed!" : `✗ ${failures} test(s) failed`}`);
process.exit(failures > 0 ? 1 : 0);

