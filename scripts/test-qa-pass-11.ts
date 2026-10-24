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
// Simulate missing column by creating warmup rows without equipment_ids
type WarmupRowWithoutEquipment = Omit<WarmupRow, 'equipment_ids'> & { equipment_ids?: string[] };
const testWarmups: WarmupRowWithoutEquipment[] = [
  {
    id: "test-1",
    slug: "test-mobility",
    name: "Test Mobility",
    type: "mobility",
    target_regions: ["shoulder"],
    target_muscles: ["front_delts"],
    duration_seconds: 60,
    instructions: ["Test"],
    contraindicated_regions: [],
    // equipment_ids omitted to simulate missing column
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
    contraindicated_regions: [],
    // equipment_ids omitted
  },
];

try {
  const warmup = selectWarmup({
    warmups: testWarmups as WarmupRow[],
    trainingMuscles: ["chest", "front_delts"],
    injuryRegions: [],
    track: "weights",
    hasAllEquipment: false,
    availableEquipment: new Set([]),
  });
  check("Warmup handles missing equipment_ids column", true);
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  check("Warmup handles missing equipment_ids column", false, message);
}

try {
  const cooldown = selectCooldown({
    stretches: testWarmups as WarmupRow[],
    trainingMuscles: ["chest"],
    injuryRegions: [],
    hasAllEquipment: false,
    availableEquipment: new Set([]),
  });
  check("Cooldown handles missing equipment_ids column", true);
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  check("Cooldown handles missing equipment_ids column", false, message);
}

// ====================
// 2. Knee injury coordinator allowlist and scoring (restored from PR #53)
// ====================

testSeeds("2. Knee injury: first lower main exercise is knee-safe quad (from allowlist), comes before any hinge, no hip-flexion-with-band as main, no adjacent hinges",
  { currentInjuryRegions: ["knee"], level: "intermediate", daysPerWeek: 4, hasAllEquipment: true },
  (plan, picked, seed) => {
    const lowerDays = plan.days.filter(d => d.focus === "lower" || d.focus === "legs");
    
    // Coordinator allowlist (restored from PR #53): leg-extensions, single-leg-leg-extension, box-squat, wall-sit, spanish-squat
    const kneeSafeAllowlist = [
      "leg-extensions", "single-leg-leg-extension", "box-squat", "wall-sit", "spanish-squat"
    ];
    
    // Check first main exercise on each Lower day
    lowerDays.forEach((day, dayIdx) => {
      if (day.exercises.length > 0) {
        const firstEx = byId.get(day.exercises[0].exerciseId)!;
        const isKneeSafe = kneeSafeAllowlist.includes(firstEx.slug);
        check(`Seed ${seed} Lower day ${dayIdx + 1}: first exercise is knee-safe from allowlist`, 
          isKneeSafe, 
          `Got ${firstEx.name} [${firstEx.slug}]`);
        
        // Check knee-safe quad comes before any hinge
        const firstHingeIndex = day.exercises.findIndex(e => {
          const ex = byId.get(e.exerciseId);
          return ex && ex.movement_pattern === "hinge";
        });
        
        if (firstHingeIndex !== -1) {
          // There is a hinge, make sure a knee-safe quad comes first
          const kneeSafeBeforeHinge = day.exercises.slice(0, firstHingeIndex).some(e => {
            const ex = byId.get(e.exerciseId);
            return ex && kneeSafeAllowlist.includes(ex.slug);
          });
          check(`Seed ${seed} Lower day ${dayIdx + 1}: knee-safe quad before hinge`, 
            kneeSafeBeforeHinge,
            `First hinge at position ${firstHingeIndex + 1}`);
        }
        
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
// REVERTED_WITH_53_GENERATOR: Tests for PR #53 generator pacing logic
// ====================
// These tests verify pacing behavior introduced in PR #53 (merge commit 66cdf5c) that was
// reverted in PR #67 due to HIGH regression (1-set rows, stacked duplicates).
// The pre-PR#53 generator does not have:
// - The "add exercises first, then sets" pacing strategy
// - The post-pacing push/pull balance that can reduce sets to 1
// 
// Kept for reference and future restoration when the forward fix lands.
// See: uploads/report-bot1-pr53.md

if (false) {  // SKIPPED - reverted with PR #53 generator (PR #67)
  console.log("\n[SKIPPED] REVERTED_WITH_53_GENERATOR tests:");
  console.log("  - 3. Pacing: exercise-first strategy with level caps");
  console.log("These tests are preserved but skipped because they test behavior from");
  console.log("PR #53 that was reverted in PR #67. See PR #67 body for details.\n");

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
}

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
// 7. Safety exclusions (restored from PR #53)
// ====================

// 7c. Beginners get no high-impact plyometric (restored from PR #53)
console.log("\n7c. Beginners: no high-impact plyometric moves (matrix test)");
const beginnerLevels = ["beginner"] as const;
const equipmentSets: Array<{ name: string; hasAll: boolean; ids: string[]; track: "weights" | "bodyweight" }> = [
  { name: "gym", hasAll: true, ids: [], track: "weights" },
  { name: "home-dumbbell", hasAll: false, ids: ["dumbbell"], track: "weights" },
  { name: "bodyweight", hasAll: false, ids: [], track: "bodyweight" },
];
const durations = [30, 45, 60, 75];

let beginnerTestCount = 0;
let beginnerFailCount = 0;

for (const level of beginnerLevels) {
  for (const equipment of equipmentSets) {
    for (const duration of durations) {
      for (const days of [3, 4, 5]) {
        beginnerTestCount++;
        const testInput = base({
          userId: `beginner-impact-${equipment.name}-${duration}-${days}d`,
          level,
          primaryTrack: equipment.track,
          hasAllEquipment: equipment.hasAll,
          equipmentIds: equipment.ids,
          daysPerWeek: days,
          preferredSessionMinutes: duration,
        });
        
        const { picked } = allPicked(testInput);
        const highImpact = picked.filter(e => e.impact === "high");
        
        if (highImpact.length > 0) {
          check(`Beginner ${equipment.name} ${days}d ${duration}min: no high-impact`, false,
            highImpact.map(e => e.name).join(", "));
          beginnerFailCount++;
        }
      }
    }
  }
}

if (beginnerFailCount === 0) {
  check(`All ${beginnerTestCount} beginner profiles: no high-impact moves`, true);
}

// QA repro cases for beginner high-impact
console.log("\n7c. QA repro: beginner/gym/general/3d/60min Full Body B slot 4");
const qa7c1 = generateProgram(base({
  userId: "qa-7c-1",
  level: "beginner",
  goal: "general_fitness",
  primaryTrack: "weights",
  hasAllEquipment: true,
  daysPerWeek: 3,
  preferredSessionMinutes: 60,
}));
const fb_b_day = qa7c1.days.find(d => d.label === "Full Body B");
if (fb_b_day && fb_b_day.exercises.length >= 4) {
  const slot4Ex = byId.get(fb_b_day.exercises[3].exerciseId)!;
  const isHighImpact = slot4Ex.impact === "high";
  check(`Full Body B slot 4: not high-impact`, !isHighImpact,
    isHighImpact ? `Got ${slot4Ex.name} (impact=${slot4Ex.impact})` : "");
}

console.log("\n7c. QA repro: beginner/gym/5d/30min/shoulder-injury Push slot 2");
const qa7c2 = generateProgram(base({
  userId: "qa-7c-2",
  level: "beginner",
  primaryTrack: "weights",
  hasAllEquipment: true,
  daysPerWeek: 5,
  preferredSessionMinutes: 30,
  currentInjuryRegions: ["shoulder"],
}));
const push_day = qa7c2.days.find(d => d.label === "Push");
if (push_day && push_day.exercises.length >= 2) {
  const slot2Ex = byId.get(push_day.exercises[1].exerciseId)!;
  const isHighImpact = slot2Ex.impact === "high";
  check(`Push slot 2: not high-impact`, !isHighImpact,
    isHighImpact ? `Got ${slot2Ex.name} (impact=${slot2Ex.impact})` : "");
}

// 7d. Lower_back injury excludes windmill and loaded side bends (restored from PR #53)
console.log("\n7d. Lower_back injury: no windmill/loaded side-bend (matrix test)");
const levels = ["beginner", "intermediate", "expert"] as const;

let lowerBackTestCount = 0;
let lowerBackFailCount = 0;

for (const level of levels) {
  for (const equipment of equipmentSets) {
    for (const duration of durations) {
      for (const days of [3, 4, 5]) {
        lowerBackTestCount++;
        const testInput = base({
          userId: `lower-back-${level}-${equipment.name}-${duration}-${days}d`,
          level,
          primaryTrack: equipment.track,
          hasAllEquipment: equipment.hasAll,
          equipmentIds: equipment.ids,
          daysPerWeek: days,
          preferredSessionMinutes: duration,
          currentInjuryRegions: ["lower_back"],
        });
        
        const { picked } = allPicked(testInput);
        const windmills = picked.filter(e => 
          (e.name.toLowerCase().includes("windmill") || e.slug.includes("windmill") ||
           e.name.toLowerCase().includes("side bend") || e.slug.includes("side-bend")) &&
          e.equipment_ids.length > 0
        );
        
        if (windmills.length > 0) {
          check(`${level} ${equipment.name} ${days}d ${duration}min lower_back: no loaded windmill/side-bend`, false,
            windmills.map(e => e.name).join(", "));
          lowerBackFailCount++;
        }
      }
    }
  }
}

if (lowerBackFailCount === 0) {
  check(`All ${lowerBackTestCount} lower_back profiles: no loaded windmill/side-bend`, true);
}

// QA repro case for lower_back windmill
console.log("\n7d. QA repro: intermediate/gym/4d/45min/lower_back Lower slot 4");
const qa7d = generateProgram(base({
  userId: "qa-7d",
  level: "intermediate",
  primaryTrack: "weights",
  hasAllEquipment: true,
  daysPerWeek: 4,
  preferredSessionMinutes: 45,
  currentInjuryRegions: ["lower_back"],
}));
const lower_day = qa7d.days.find(d => d.label === "Lower A" || d.label === "Lower B");
if (lower_day && lower_day.exercises.length >= 4) {
  const slot4Ex = byId.get(lower_day.exercises[3].exerciseId)!;
  const isWindmill = (slot4Ex.name.toLowerCase().includes("windmill") || 
                      slot4Ex.slug.includes("windmill") ||
                      slot4Ex.name.toLowerCase().includes("side bend") || 
                      slot4Ex.slug.includes("side-bend")) &&
                     slot4Ex.equipment_ids.length > 0;
  check(`Lower slot 4: not loaded windmill/side-bend`, !isWindmill,
    isWindmill ? `Got ${slot4Ex.name}` : "");
}

// ====================
// Additional contraindications from injury-deload-yoga report
// ====================

testSeeds("Shoulder injury: no pushups or upright rows on Upper/Push days",
  { currentInjuryRegions: ["shoulder"], level: "intermediate", daysPerWeek: 5, hasAllEquipment: true },
  (plan, picked, seed) => {
    const upperPushDays = plan.days.filter(d => 
      d.focus === "upper" || d.focus === "push" || d.focus === "pull"
    );
    
    upperPushDays.forEach((day, dayIdx) => {
      const dayExercises = day.exercises.map(e => byId.get(e.exerciseId)!);
      const hasPushups = dayExercises.some(e => 
        e.slug === "pushups" || e.slug === "push-up-wide"
      );
      const hasUprightRow = dayExercises.some(e => 
        e.slug.includes("upright") && e.slug.includes("row")
      );
      check(`Seed ${seed} ${day.label}: no pushups`, !hasPushups);
      check(`Seed ${seed} ${day.label}: no upright rows`, !hasUprightRow);
    });
  }
);

testSeeds("Lower_back injury: no loaded side bends",
  { currentInjuryRegions: ["lower_back"], level: "intermediate", daysPerWeek: 4, hasAllEquipment: true },
  (plan, picked, seed) => {
    const sideBends = picked.filter(e => 
      e.slug === "barbell-side-bend" || 
      e.slug === "weighted-ball-side-bend" ||
      e.slug === "dumbbell-side-bend" ||
      e.slug === "one-arm-high-pulley-cable-side-bends"
    );
    check(`Seed ${seed}: no loaded side bends`, sideBends.length === 0,
      sideBends.length > 0 ? sideBends.map(e => e.name).join(", ") : "");
  }
);

testSeeds("Knee injury: no glute ham raise",
  { currentInjuryRegions: ["knee"], level: "intermediate", daysPerWeek: 4, hasAllEquipment: true },
  (plan, picked, seed) => {
    const gluteHam = picked.filter(e => 
      e.slug === "glute-ham-raise" || e.slug === "natural-glute-ham-raise"
    );
    check(`Seed ${seed}: no glute ham raise`, gluteHam.length === 0,
      gluteHam.length > 0 ? gluteHam.map(e => e.name).join(", ") : "");
  }
);

console.log("\nKnee injury warm-up and cool-down exclusions:");
const kneeWarmup = selectWarmup({
  warmups,
  trainingMuscles: ["quads", "hamstrings"],
  injuryRegions: ["knee"],
  track: "weights",
  hasAllEquipment: true,
  availableEquipment: null,
});
const hasWorldsGreatest = kneeWarmup.some(w => w.slug === "worlds-greatest");
const hasKneelingHipFlexor = kneeWarmup.some(w => w.slug === "hip-flexor-stretch-kneeling");
check("Knee warm-up: no world's greatest stretch", !hasWorldsGreatest);
check("Knee warm-up: no kneeling hip flexor stretch", !hasKneelingHipFlexor);

const kneeCooldown = selectCooldown({
  stretches: warmups,
  trainingMuscles: ["quads", "hamstrings"],
  injuryRegions: ["knee"],
  hasAllEquipment: true,
  availableEquipment: null,
});
const cooldownWorldsGreatest = kneeCooldown.some(w => w.slug === "worlds-greatest");
const cooldownKneelingHipFlexor = kneeCooldown.some(w => w.slug === "hip-flexor-stretch-kneeling");
check("Knee cool-down: no world's greatest stretch", !cooldownWorldsGreatest);
check("Knee cool-down: no kneeling hip flexor stretch", !cooldownKneelingHipFlexor);

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

// ====================
// Cool-down with injuries: only exclude contraindicated stretches, not those targeting the region
// ====================

console.log("\n(b) Cool-down: Upper day with shoulder injury gets upper-body stretches");
const shoulderCooldown = selectCooldown({
  stretches: warmups,
  trainingMuscles: ["chest", "lats", "front_delts"],
  injuryRegions: ["shoulder"],
  hasAllEquipment: true,
  availableEquipment: null,
});
const upperBodyStretches = shoulderCooldown.filter(s => {
  const upperRegions = ["shoulder", "neck", "upper_back"];
  return s.target_regions.some(r => upperRegions.includes(r));
});
const lowerOnlyStretches = shoulderCooldown.filter(s => {
  const lowerRegions = ["hip", "knee", "ankle", "calf"];
  const upperRegions = ["shoulder", "neck", "upper_back"];
  return s.target_regions.some(r => lowerRegions.includes(r)) && 
         !s.target_regions.some(r => upperRegions.includes(r));
});
check("Shoulder injury Upper: ≥2 upper-body stretches", upperBodyStretches.length >= 2,
  `got ${upperBodyStretches.length}: ${upperBodyStretches.map(s => s.name).join(", ")}`);
check("Shoulder injury Upper: no lower-only stretches", lowerOnlyStretches.length === 0,
  lowerOnlyStretches.length > 0 ? lowerOnlyStretches.map(s => s.name).join(", ") : "");

console.log("\n(c) Cool-down: Lower day with lower_back+hip gets lower-body stretches");
const lowerBackCooldown = selectCooldown({
  stretches: warmups,
  trainingMuscles: ["quads", "hamstrings", "glutes"],
  injuryRegions: ["lower_back", "hip"],
  hasAllEquipment: true,
  availableEquipment: null,
});
const lowerBodyStretches = lowerBackCooldown.filter(s => {
  const lowerRegions = ["hip", "knee", "ankle", "calf", "lower_back"];
  return s.target_regions.some(r => lowerRegions.includes(r));
});
const upperOnlyStretches = lowerBackCooldown.filter(s => {
  const upperRegions = ["shoulder", "neck", "upper_back"];
  const lowerRegions = ["hip", "knee", "ankle", "calf", "lower_back"];
  return s.target_regions.some(r => upperRegions.includes(r)) && 
         !s.target_regions.some(r => lowerRegions.includes(r));
});
check("Lower_back+hip Lower: ≥2 lower-body stretches", lowerBodyStretches.length >= 2,
  `got ${lowerBodyStretches.length}: ${lowerBodyStretches.map(s => s.name).join(", ")}`);
check("Lower_back+hip Lower: no upper-only stretches", upperOnlyStretches.length === 0,
  upperOnlyStretches.length > 0 ? upperOnlyStretches.map(s => s.name).join(", ") : "");

console.log("\n(d) Past knee injury: gets prehab but doesn't exclude squat/lunge drills");
const pastKneeWarmup = selectWarmup({
  warmups,
  trainingMuscles: ["quads", "hamstrings"],
  injuryRegions: [], // No current injuries
  prehabRegions: ["knee"], // Past knee injury
  track: "weights",
  hasAllEquipment: true,
  availableEquipment: null,
});
const kneePrehab = pastKneeWarmup.filter(w => w.phase === "prehab" && w.target_regions.includes("knee"));
const squatLungeDrills = pastKneeWarmup.filter(w => 
  w.phase === "mobility" && (w.slug.includes("squat") || w.slug.includes("lunge"))
);
check("Past knee injury: gets knee prehab", kneePrehab.length > 0,
  kneePrehab.length > 0 ? kneePrehab.map(p => p.name).join(", ") : "none");
check("Past knee injury: allows squat/lunge drills", squatLungeDrills.length > 0 || pastKneeWarmup.some(w => w.slug === "bodyweight-squat"),
  "no squat/lunge drills excluded by past injury");

// Summary
console.log(`\n${failures === 0 ? "✓ All tests passed!" : `✗ ${failures} test(s) failed`}`);
process.exit(failures > 0 ? 1 : 0);
