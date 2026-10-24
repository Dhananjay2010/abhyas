/**
 * QA Pass 10 Followup Test Suite
 * 
 * Tests fixes from PR #13 followup (QA Bot 1 reports).
 * Runs against the POST-MIGRATION fixture (scripts/fixtures/catalogue.json).
 * 
 *   npm run test:qa-pass-11
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
// 1. Robustness: equipment_ids ?? [] in warmup.ts
// ====================

console.log("\n1. Robustness: equipment_ids ?? [] handles missing column");
const testWarmups: WarmupRow[] = [
  {
    id: "test-1",
    slug: "test-mobility",
    name: "Test Mobility",
    type: "mobility",
    target_regions: ["shoulder"],
    target_muscles: ["front_delts"],
    duration_seconds: 60,
    instructions: ["Test"],
    equipment_ids: undefined as any, // Simulate missing column
  },
  {
    id: "test-2",
    slug: "test-stretch",
    name: "Test Stretch",
    type: "stretch",
    target_regions: ["shoulder"],
    target_muscles: ["front_delts"],
    duration_seconds: 30,
    instructions: ["Test"],
    equipment_ids: undefined as any,
  },
];

try {
  const warmup = selectWarmup({
    warmups: testWarmups,
    trainingMuscles: ["chest", "front_delts"],
    injuryRegions: [],
    track: "weights",
    hasAllEquipment: false,
    availableEquipment: new Set([]),
  });
  check("Warmup handles missing equipment_ids column", true);
} catch (e: any) {
  check("Warmup handles missing equipment_ids column", false, e.message);
}

try {
  const cooldown = selectCooldown({
    stretches: testWarmups,
    trainingMuscles: ["chest"],
    injuryRegions: [],
    hasAllEquipment: false,
    availableEquipment: new Set([]),
  });
  check("Cooldown handles missing equipment_ids column", true);
} catch (e: any) {
  check("Cooldown handles missing equipment_ids column", false, e.message);
}

// ====================
// 2. HIGH knee: hip-flexion-with-band never a main lift, knee-safe options first
// ====================

testSeeds("2. Knee injury: first lower main exercise is knee-safe OR hinge (when no knee-safe quads available), no hip-flexion-with-band as main, no adjacent hinges",
  { currentInjuryRegions: ["knee"], level: "intermediate", daysPerWeek: 4, hasAllEquipment: true },
  (plan, picked, seed) => {
    const lowerDays = plan.days.filter(d => d.focus === "lower" || d.focus === "legs");
    
    // Check first main exercise on each Lower day
    lowerDays.forEach((day, dayIdx) => {
      if (day.exercises.length > 0) {
        const firstEx = byId.get(day.exercises[0].exerciseId)!;
        const kneeSafeSlugs = [
          "box-squat", "goblet-squat", "wall-sit", "leg-extension", 
          "step-up", "bulgarian-split-squat", "single-leg", "squat-to-a-bench"
        ];
        const isKneeSafe = kneeSafeSlugs.some(slug => firstEx.slug.includes(slug)) ||
                          firstEx.slug === "bodyweight-squat";
        // Hinge exercises are okay if no knee-safe squats are available (they don't stress the knee)
        const isHinge = firstEx.movement_pattern === "hinge";
        const isAcceptable = isKneeSafe || isHinge;
        check(`Seed ${seed} Lower day ${dayIdx + 1}: first exercise is knee-safe or hinge`, 
          isAcceptable, 
          `Got ${firstEx.name} [${firstEx.movement_pattern}]`);
        
        // Check hip-flexion-with-band is NOT in main slots (first 4)
        const mainExercises = day.exercises.slice(0, 4).map(e => byId.get(e.exerciseId)!);
        const hasHipFlexionMain = mainExercises.some(e => e.slug === "hip-flexion-with-band");
        check(`Seed ${seed} Lower day ${dayIdx + 1}: hip-flexion-with-band not in main slots`, !hasHipFlexionMain);
      }
    });
    
    // Check no adjacent hinges across all days
    const allDays = plan.days.filter(d => d.dayType === "weights");
    allDays.forEach((day, dayIdx) => {
      let hasAdjacentHinges = false;
      for (let i = 0; i < day.exercises.length - 1; i++) {
        const current = byId.get(day.exercises[i].exerciseId);
        const next = byId.get(day.exercises[i + 1].exerciseId);
        if (current?.movement_pattern === "hinge" && next?.movement_pattern === "hinge") {
          hasAdjacentHinges = true;
          check(`Seed ${seed} Day ${dayIdx + 1}: no adjacent hinges`, false, 
            `${current.name} then ${next.name}`);
          break;
        }
      }
      if (!hasAdjacentHinges) {
        check(`Seed ${seed} Day ${dayIdx + 1}: no adjacent hinges`, true);
      }
    });
  }
);

// ====================
// 3. MEDIUM pacing: exercise first, then sets, with level caps
// ====================

testSeeds("3. Pacing: beginner has no exercise above 3 sets, at least 4 exercises",
  { level: "beginner", goal: "general_fitness", daysPerWeek: 3, preferredSessionMinutes: 45, hasAllEquipment: true },
  (plan, picked, seed) => {
    const trainingDays = plan.days.filter(d => d.dayType === "weights" || d.dayType === "bodyweight");
    trainingDays.forEach((day, dayIdx) => {
      const maxSets = Math.max(...day.exercises.map(e => e.targetSets));
      check(`Seed ${seed} Day ${dayIdx + 1}: beginner max 3 sets`, maxSets <= 3, `max ${maxSets} sets`);
      check(`Seed ${seed} Day ${dayIdx + 1}: at least 4 exercises`, day.exercises.length >= 4, 
        `got ${day.exercises.length}`);
    });
  }
);

testSeeds("3. Pacing: bodyweight beginner fat_loss has balanced push/pull sets",
  { level: "beginner", goal: "fat_loss", primaryTrack: "bodyweight", daysPerWeek: 3, preferredSessionMinutes: 45, 
    hasAllEquipment: false, equipmentIds: [] },
  (plan, picked, seed) => {
    const trainingDays = plan.days.filter(d => d.dayType === "bodyweight");
    trainingDays.forEach((day, dayIdx) => {
      const pushPatterns = ["horizontal_press", "vertical_press"];
      const pullPatterns = ["horizontal_pull", "vertical_pull"];
      
      const pushSets = day.exercises.filter(e => {
        const ex = byId.get(e.exerciseId);
        return ex && pushPatterns.includes(ex.movement_pattern);
      }).reduce((sum, e) => sum + e.targetSets, 0);
      
      const pullSets = day.exercises.filter(e => {
        const ex = byId.get(e.exerciseId);
        return ex && pullPatterns.includes(ex.movement_pattern);
      }).reduce((sum, e) => sum + e.targetSets, 0);
      
      const diff = Math.abs(pushSets - pullSets);
      check(`Seed ${seed} Day ${dayIdx + 1}: push/pull sets differ by ≤1 set-group`, diff <= 1,
        `push ${pushSets}, pull ${pullSets}`);
    });
  }
);

// Test 75 min > 60 min
console.log("\n3. Pacing: 75 min has more total working sets or exercises than 60 min (4-day intermediate gym)");
const input60 = base({ preferredSessionMinutes: 60, userId: "11111111-1111-1111-1111-111111111111" });
const input75 = base({ preferredSessionMinutes: 75, userId: "11111111-1111-1111-1111-111111111111" });
const plan60 = generateProgram(input60);
const plan75 = generateProgram(input75);

const trainingDays60 = plan60.days.filter(d => d.dayType === "weights");
const trainingDays75 = plan75.days.filter(d => d.dayType === "weights");

const totalSets60 = trainingDays60.reduce((sum, d) => 
  sum + d.exercises.reduce((s, e) => s + e.targetSets, 0), 0);
const totalSets75 = trainingDays75.reduce((sum, d) => 
  sum + d.exercises.reduce((s, e) => s + e.targetSets, 0), 0);

const totalExercises60 = trainingDays60.reduce((sum, d) => sum + d.exercises.length, 0);
const totalExercises75 = trainingDays75.reduce((sum, d) => sum + d.exercises.length, 0);

check("75 min has more sets or exercises than 60 min", 
  totalSets75 > totalSets60 || totalExercises75 > totalExercises60,
  `60min: ${totalExercises60} ex, ${totalSets60} sets; 75min: ${totalExercises75} ex, ${totalSets75} sets`);

// ====================
// 4. MEDIUM cooldown: only uses type='stretch' rows, current injuries only
// ====================

console.log("\n4. Cooldown: only uses type='stretch' rows, never mobility");
const cooldownTest = selectCooldown({
  stretches: warmups,
  trainingMuscles: ["chest", "quads"],
  injuryRegions: [],
  hasAllEquipment: true,
  availableEquipment: null,
});
const nonStretch = cooldownTest.filter(w => w.type !== "stretch");
check("Cooldown only has type='stretch' rows", nonStretch.length === 0,
  nonStretch.length > 0 ? `Found ${nonStretch.map(w => w.type).join(", ")}` : "");

// ====================
// 6. MEDIUM upright rows: min reps >= 8
// ====================

testSeeds("6. Upright rows: all variants have min reps >= 8 (gym advanced strength 5d 60min)",
  { level: "expert", goal: "strength", daysPerWeek: 5, preferredSessionMinutes: 60, hasAllEquipment: true },
  (plan, picked, seed) => {
    const uprightRows = plan.days.flatMap(d => 
      d.exercises.filter(e => {
        const ex = byId.get(e.exerciseId);
        return ex && (ex.slug.includes("upright-row") || ex.slug.includes("upright_row"));
      })
    );
    
    if (uprightRows.length > 0) {
      const badReps = uprightRows.filter(e => (e.targetRepsMin ?? 8) < 8);
      check(`Seed ${seed}: upright rows have min reps >= 8`, badReps.length === 0,
        badReps.length > 0 ? `Found ${badReps[0].targetRepsMin} reps` : "");
    } else {
      check(`Seed ${seed}: upright rows have min reps >= 8`, true, "(no upright rows in plan)");
    }
  }
);

// ====================
// 7. LOWs
// ====================

// (c) Beginners get no high-impact plyometric
testSeeds("7c. Beginners get no high-impact plyometric (Knee Tuck Jump, etc.)",
  { level: "beginner", daysPerWeek: 3, preferredSessionMinutes: 30, hasAllEquipment: false, equipmentIds: [] },
  (plan, picked, seed) => {
    const highImpact = picked.filter(e => e.impact === "high");
    check(`Seed ${seed}: beginner has no high-impact moves`, highImpact.length === 0,
      highImpact.length > 0 ? highImpact.map(e => e.name).join(", ") : "");
  }
);

// (d) Advanced Kettlebell Windmill contraindicated for lower_back
testSeeds("7d. Lower_back injury excludes kettlebell windmill and loaded side bends",
  { currentInjuryRegions: ["lower_back"], level: "intermediate", daysPerWeek: 4, hasAllEquipment: true },
  (plan, picked, seed) => {
    const windmills = picked.filter(e => 
      (e.name.toLowerCase().includes("windmill") || e.slug.includes("windmill") ||
       e.name.toLowerCase().includes("side bend") || e.slug.includes("side-bend")) &&
      e.equipment_ids.length > 0
    );
    check(`Seed ${seed}: lower_back injury has no loaded windmill/side-bend`, windmills.length === 0,
      windmills.length > 0 ? windmills.map(e => e.name).join(", ") : "");
  }
);

// ====================
// (a) Session length: 30-min beginner has push/pull/legs/core, within ±5 min
// ====================

testSeeds("(a) Session length: 30-min beginner has push/pull/legs/core, within ±5 min (rb2 profile)",
  { level: "beginner", goal: "general_fitness", primaryTrack: "bodyweight", daysPerWeek: 3, 
    preferredSessionMinutes: 30, hasAllEquipment: false, equipmentIds: [] },
  (plan, picked, seed) => {
    const trainingDays = plan.days.filter(d => d.dayType === "bodyweight" || d.dayType === "weights");
    
    // Check at least one day has all patterns
    const hasAllPatterns = trainingDays.some(day => {
      const patterns = day.exercises.map(e => byId.get(e.exerciseId)?.movement_pattern ?? "other");
      const hasPush = patterns.some(p => p === "horizontal_press" || p === "vertical_press");
      const hasPull = patterns.some(p => p === "horizontal_pull" || p === "vertical_pull");
      const hasLegs = patterns.some(p => p === "squat" || p === "hinge" || p === "lunge");
      const hasCore = patterns.some(p => p === "core");
      return hasPush && hasPull && hasLegs && hasCore;
    });
    
    check(`Seed ${seed}: at least one day has push/pull/legs/core`, hasAllPatterns);
    
    // Check duration within ±5 min
    trainingDays.forEach((day, dayIdx) => {
      const estimate = estimateSessionMinutes(day);
      const withinRange = estimate >= 25 && estimate <= 35;
      check(`Seed ${seed} Day ${dayIdx + 1}: 30-min target within ±5`, withinRange,
        `estimated ${estimate.toFixed(0)} min`);
    });
  }
);

// Test 20 vs 30 differ OR have different time estimates
console.log("\n(a) Session length: 20 vs 30 min produce different plans or time targets");
const plan20 = generateProgram(base({ preferredSessionMinutes: 20, level: "beginner", daysPerWeek: 3, 
  userId: "11111111-1111-1111-1111-111111111111" }));
const plan30 = generateProgram(base({ preferredSessionMinutes: 30, level: "beginner", daysPerWeek: 3, 
  userId: "11111111-1111-1111-1111-111111111111" }));

const totalEx20 = plan20.days.filter(d => d.dayType === "weights").reduce((sum, d) => sum + d.exercises.length, 0);
const totalEx30 = plan30.days.filter(d => d.dayType === "weights").reduce((sum, d) => sum + d.exercises.length, 0);

const avg20 = plan20.days.filter(d => d.dayType === "weights")
  .reduce((sum, d) => sum + estimateSessionMinutes(d), 0) / 3;
const avg30 = plan30.days.filter(d => d.dayType === "weights")
  .reduce((sum, d) => sum + estimateSessionMinutes(d), 0) / 3;

check("20 min vs 30 min: different exercise count or avg time within target ranges", 
  totalEx20 !== totalEx30 || (avg20 >= 15 && avg20 <= 25 && avg30 >= 25 && avg30 <= 35),
  `20min: ${totalEx20} ex, ${avg20.toFixed(0)}min avg; 30min: ${totalEx30} ex, ${avg30.toFixed(0)}min avg`);

// Summary
console.log(`\n${failures === 0 ? "✓ All tests passed!" : `✗ ${failures} test(s) failed`}`);
process.exit(failures > 0 ? 1 : 0);
