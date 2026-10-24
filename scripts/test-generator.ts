/**
 * Exercises the block generator against the real catalogue.
 *
 * The generator is a pure function, so we feed it a catalogue exported from the
 * live database (scripts/export-catalogue) rather than mocking exercises. What
 * is asserted here is the part that can hurt someone: that safety filters
 * actually remove what they claim to.
 *
 *   npm run test:generator
 */
import { readFileSync } from "node:fs";
import {
  generateProgram,
  STAPLE_MOVEMENTS,
  type CandidateExercise,
  type GeneratorInput,
} from "../src/lib/program/generate";

// Defaults to the committed fixture so the suite runs offline; refresh it with
// scripts/export-catalogue.sh after changing the exercise seed.
const fixture = process.argv[2] ?? "scripts/fixtures/catalogue.json";
const catalogue = JSON.parse(readFileSync(fixture, "utf8")) as CandidateExercise[];
const byId = new Map(catalogue.map((e) => [e.id, e]));

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
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
    catalogue,
    ...overrides,
  };
}

function allPicked(input: GeneratorInput) {
  const plan = generateProgram(input);
  const picked = plan.days.flatMap((d) => d.exercises.map((e) => byId.get(e.exerciseId)!));
  return { plan, picked };
}

console.log("\n1. Baseline: gym, 4 days, muscle gain");
{
  const { plan, picked } = allPicked(base());
  const training = plan.days.filter((d) => d.dayType === "weights");
  check("4 training days", training.length === 4, `got ${training.length}`);
  check("3 rest days", plan.days.filter((d) => d.dayType === "rest").length === 3);
  check("every training day has exercises", training.every((d) => d.exercises.length > 0));
  check("no exercise repeats in the block", new Set(picked.map((e) => e.id)).size === picked.length);
  check("upper/lower split", plan.splitType === "upper_lower", plan.splitType);
  const reps = plan.days.flatMap((d) => d.exercises).every((e) => e.targetRepsMin >= 8);
  check("muscle-gain rep range applied", reps);
}

console.log("\n2. Knee injury must remove every knee-loading exercise");
{
  const { picked } = allPicked(base({ currentInjuryRegions: ["knee"] }));
  const bad = picked.filter((e) => e.contraindicated_regions.includes("knee"));
  check("no knee-contraindicated exercise", bad.length === 0, bad.map((b) => b.name).join(", "));
}

console.log("\n3. Age 55 must cap high spinal load");
{
  const { picked } = allPicked(base({ age: 55 }));
  const bad = picked.filter((e) => e.spinal_load === "high");
  check("no high spinal load", bad.length === 0, bad.map((b) => b.name).join(", "));
}

console.log("\n4. BMI 32 must remove high-impact work");
{
  const { picked } = allPicked(base({ bmi: 32 }));
  const bad = picked.filter((e) => e.impact === "high");
  check("no high-impact exercise", bad.length === 0, bad.map((b) => b.name).join(", "));
}

console.log("\n5. Bodyweight at home, no equipment at all");
{
  const { plan, picked } = allPicked(
    base({ primaryTrack: "bodyweight", hasAllEquipment: false, equipmentIds: [], daysPerWeek: 3 }),
  );
  check("nothing needs equipment", picked.every((e) => e.equipment_ids.length === 0),
    picked.filter((e) => e.equipment_ids.length).map((e) => e.name).join(", "));
  check("all bodyweight-track", picked.every((e) => e.tracks.includes("bodyweight")));
  check("still produced a plan", picked.length > 0, `${picked.length} exercises`);
  check("full body split", plan.splitType === "full_body", plan.splitType);
  check("day type is bodyweight", plan.days.some((d) => d.dayType === "bodyweight"));
}

console.log("\n6. Beginner must never get advanced movements");
{
  const { picked } = allPicked(base({ level: "beginner" }));
  const bad = picked.filter((e) => e.level_min !== "beginner");
  check("only beginner-level exercises", bad.length === 0, bad.map((b) => b.name).join(", "));
}

console.log("\n7. Limited home equipment (dumbbells + bench only)");
{
  const { picked } = allPicked(
    base({ hasAllEquipment: false, equipmentIds: ["dumbbell", "flat_bench"] }),
  );
  const available = new Set(["dumbbell", "flat_bench"]);
  const bad = picked.filter((e) => !e.equipment_ids.every((x) => available.has(x)));
  check("nothing outside the equipment list", bad.length === 0,
    bad.map((b) => `${b.name}[${b.equipment_ids}]`).join(", "));
  check("still produced a plan", picked.length > 0, `${picked.length} exercises`);
}

console.log("\n8. Yoga days are placed and kept off leg days");
{
  const { plan } = allPicked(base({ daysPerWeek: 5, yogaDaysPerWeek: 2 }));
  const yoga = plan.days.filter((d) => d.dayType === "yoga");
  const training = plan.days.filter((d) => d.dayType === "weights" || d.dayType === "bodyweight");
  check("2 yoga days", yoga.length === 2, `got ${yoga.length}`);
  check("3 training days", training.length === 3, `got ${training.length}`);

  const active = plan.days.filter((d) => d.dayType !== "rest");
  let adjacentToLegs = false;
  active.forEach((d, i) => {
    if (d.dayType !== "yoga") return;
    for (const n of [active[i - 1], active[i + 1]]) {
      if (n && (n.focus === "legs" || n.focus === "lower")) adjacentToLegs = true;
    }
  });
  check("no yoga day next to a leg day", !adjacentToLegs);
}

console.log("\n9. Determinism and block-to-block variety");
{
  const a = generateProgram(base());
  const b = generateProgram(base());
  const slugsOf = (p: ReturnType<typeof generateProgram>) =>
    p.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)).join(",");
  check("same input gives same plan", slugsOf(a) === slugsOf(b));

  const block2 = generateProgram(base({ blockNumber: 2 }));
  const s1 = new Set(a.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
  const s2 = new Set(block2.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)));
  const overlap = [...s1].filter((x) => s2.has(x)).length;
  const pct = Math.round((overlap / Math.max(s1.size, 1)) * 100);
  check("block 2 differs from block 1", overlap < s1.size, `${pct}% carried over`);
}

console.log("\n10. Everything at once: 52yo, BMI 31, shoulder + lower back injuries");
{
  const { plan, picked } = allPicked(
    base({ age: 52, bmi: 31, currentInjuryRegions: ["shoulder", "lower_back"], level: "beginner" }),
  );
  check("no shoulder-loading", !picked.some((e) => e.contraindicated_regions.includes("shoulder")));
  check("no lower-back loading", !picked.some((e) => e.contraindicated_regions.includes("lower_back")));
  check("no high spinal load", !picked.some((e) => e.spinal_load === "high"));
  check("no high impact", !picked.some((e) => e.impact === "high"));
  check("still produced a usable plan", picked.length >= 6, `${picked.length} exercises`);
  console.log(
    "       sample:",
    plan.days.filter((d) => d.exercises.length).slice(0, 2)
      .map((d) => `${d.label}: ${d.exercises.map((e) => e.name).join(" / ")}`).join("  |  "),
  );
}

console.log("\n11. Block rollover carries the main lifts and rotates accessories");
{
  const block1 = generateProgram(base({ blockNumber: 1 }));

  // Mimic extractCarryOver: first two slots of each day, compounds only.
  const carryOver: Record<string, string> = {};
  for (const day of block1.days) {
    day.exercises.slice(0, 2).forEach((e) => {
      const ex = byId.get(e.exerciseId)!;
      if (ex.mechanic !== "compound") return;
      const key = `${day.dayIndex}:${ex.movement_pattern}`;
      if (!(key in carryOver)) carryOver[key] = e.exerciseId;
    });
  }
  check("block 1 produced main lifts to carry", Object.keys(carryOver).length > 0,
    `${Object.keys(carryOver).length} lifts`);

  const block2 = generateProgram(base({ blockNumber: 2, carryOver }));

  let mainKept = 0;
  let mainTotal = 0;
  for (const day of block2.days) {
    day.exercises.slice(0, 2).forEach((e) => {
      const ex = byId.get(e.exerciseId)!;
      if (ex.mechanic !== "compound") return;
      const key = `${day.dayIndex}:${ex.movement_pattern}`;
      if (key in carryOver) {
        mainTotal++;
        if (carryOver[key] === e.exerciseId) mainKept++;
      }
    });
  }
  check("every carried main lift reappears", mainTotal > 0 && mainKept === mainTotal,
    `${mainKept}/${mainTotal}`);

  const accessoriesOf = (p: ReturnType<typeof generateProgram>) =>
    new Set(p.days.flatMap((d) => d.exercises.slice(2).map((e) => e.exerciseId)));
  const a1 = accessoriesOf(block1);
  const a2 = accessoriesOf(block2);
  const shared = [...a1].filter((x) => a2.has(x)).length;
  const rotated = a1.size - shared;
  check("accessories rotate", rotated > 0, `${rotated} of ${a1.size} changed`);

  check("no exercise repeats within block 2",
    new Set(block2.days.flatMap((d) => d.exercises.map((e) => e.exerciseId))).size ===
      block2.days.flatMap((d) => d.exercises).length);

  // A carried lift that is no longer allowed must not survive.
  const injured = generateProgram(
    base({ blockNumber: 2, carryOver, currentInjuryRegions: ["shoulder"] }),
  );
  const bad = injured.days
    .flatMap((d) => d.exercises)
    .map((e) => byId.get(e.exerciseId)!)
    .filter((e) => e.contraindicated_regions.includes("shoulder"));
  check("carry-over cannot bypass the injury filter", bad.length === 0,
    bad.map((b) => b.name).join(", "));
}

console.log("\n12. A yoga or breathing track is not a strength split");
{
  // Regression: choosing yoga used to fall through to push/pull/legs, so the
  // user got six days of weights, no yoga at all, and -- with no equipment
  // recorded, because the yoga branch of onboarding skips that step -- two
  // completely empty Pull days.
  const yoga = generateProgram(
    base({ primaryTrack: "yoga", daysPerWeek: 6, hasAllEquipment: false, equipmentIds: [] }),
  );
  check("no weights days", !yoga.days.some((d) => d.dayType === "weights"),
    yoga.days.map((d) => d.dayType).join(","));
  check("six yoga days", yoga.days.filter((d) => d.dayType === "yoga").length === 6,
    `${yoga.days.filter((d) => d.dayType === "yoga").length}`);
  check("one rest day", yoga.days.filter((d) => d.dayType === "rest").length === 1);
  check("no exercises prescribed", yoga.days.every((d) => d.exercises.length === 0));

  const breathe = generateProgram(
    base({ primaryTrack: "meditation", daysPerWeek: 4, hasAllEquipment: false, equipmentIds: [] }),
  );
  check("breathing track gives breathing days",
    breathe.days.filter((d) => d.dayType === "meditation").length === 4,
    `${breathe.days.filter((d) => d.dayType === "meditation").length}`);
}

console.log("\n13. No training day is ever empty");
{
  // With no equipment there is no pulling movement in the catalogue at all, so
  // Pull days used to come out with zero exercises and strand the user on
  // "this session has no exercises".
  for (const days of [3, 4, 5, 6]) {
    const plan = generateProgram(
      base({ primaryTrack: "bodyweight", hasAllEquipment: false, equipmentIds: [], daysPerWeek: days }),
    );
    const empty = plan.days.filter(
      (d) => (d.dayType === "weights" || d.dayType === "bodyweight") && d.exercises.length === 0,
    );
    check(`${days}-day bodyweight plan has no empty day`, empty.length === 0,
      empty.map((d) => d.label).join(", "));
  }

  // The same shape as the real report: gym track, nothing selected.
  const noKit = generateProgram(
    base({ primaryTrack: "weights", hasAllEquipment: false, equipmentIds: [], daysPerWeek: 6 }),
  );
  const empty = noKit.days.filter((d) => d.dayType === "weights" && d.exercises.length === 0);
  check("6-day gym plan with no equipment has no empty day", empty.length === 0,
    empty.map((d) => d.label).join(", "));
  check("and still no duplicates",
    new Set(noKit.days.flatMap((d) => d.exercises.map((e) => e.exerciseId))).size ===
      noKit.days.flatMap((d) => d.exercises).length);
}

console.log("\n14. Gym users should get proper main lifts (equipment scoring fix)");
{
  const { plan, picked } = allPicked(base({ primaryTrack: "weights", hasAllEquipment: true }));
  const day1 = plan.days.find((d) => d.exercises.length > 0);
  const firstExercise = day1?.exercises[0];
  const ex = firstExercise ? byId.get(firstExercise.exerciseId) : null;
  
  // A gym user should get compound lifts, not bodyweight exercises in main slots
  check("first exercise uses equipment", !ex || ex.equipment_ids.length > 0,
    ex ? `got ${ex.name} with ${ex.equipment_ids.length} equipment items` : "no exercises");
  check("no elevated push-ups for gym users with full equipment",
    !picked.some((e) => e.slug === "push-ups-with-feet-elevated" && ex && ex.equipment_ids.length > 3));
}

console.log("\n15. Beginners should reliably get staple movements");
{
  const { picked } = allPicked(
    base({ level: "beginner", primaryTrack: "bodyweight", hasAllEquipment: false, equipmentIds: [] }),
  );
  const slugs = picked.map((e) => e.slug);
  
  // A beginner should get push-ups, squats, and other staples, not random exercises
  const hasStaple = slugs.some((s) =>
    ["pushups", "push-up-wide", "bodyweight-squat", "glute-bridge"].includes(s),
  );
  check("beginner gets at least one staple movement", hasStaple,
    `got: ${slugs.slice(0, 4).join(", ")}`);
}

console.log("\n16. Session length scales exercise count sensibly");
{
  const durations = [30, 45, 60, 75, 90];
  const counts: number[] = [];
  
  for (const minutes of durations) {
    const plan = generateProgram(base({ preferredSessionMinutes: minutes }));
    const trainingDay = plan.days.find((d) => d.dayType === "weights");
    const count = trainingDay?.exercises.length ?? 0;
    counts.push(count);
  }
  
  // Check monotonic growth: each duration should have >= exercises than the previous
  let monotonic = true;
  for (let i = 1; i < counts.length; i++) {
    if (counts[i] < counts[i - 1]) {
      monotonic = false;
      check(`${durations[i]}min has at least as many exercises as ${durations[i-1]}min`, false,
        `${durations[i]}min: ${counts[i]}, ${durations[i-1]}min: ${counts[i-1]}`);
    }
  }
  if (monotonic) {
    check("exercise count grows monotonically with session length", true,
      `30min: ${counts[0]}, 45min: ${counts[1]}, 60min: ${counts[2]}, 75min: ${counts[3]}, 90min: ${counts[4]}`);
  }
  
  // Specific requirements
  check("30-min gets a complete session", counts[0] >= 4, `got ${counts[0]} exercises`);
  check("60-min and 75-min produce different plans", counts[2] !== counts[3],
    `60min: ${counts[2]}, 75min: ${counts[3]}`);
  check("75-min has more than 60-min", counts[3] > counts[2],
    `75min: ${counts[3]}, 60min: ${counts[2]}`);
}

console.log("\n17. No-equipment users can train back and shoulders (after migrations)");
{
  const noEquipPull = catalogue.filter(
    (e) => e.movement_pattern === "horizontal_pull" && e.equipment_ids.length === 0,
  );
  const noEquipPress = catalogue.filter(
    (e) => e.movement_pattern === "vertical_press" && e.equipment_ids.length === 0,
  );
  
  if (noEquipPull.length === 0) {
    console.log("  note no-equipment horizontal pull missing (migrations not applied yet)");
  } else {
    check("catalogue has no-equipment horizontal pull", true, noEquipPull.map((e) => e.name).join(", "));
  }
  
  check("catalogue has no-equipment vertical press", noEquipPress.length > 0,
    noEquipPress.map((e) => e.name).join(", "));
  
  // Only test plan generation if the exercises exist in the catalogue
  if (noEquipPull.length > 0 && noEquipPress.length > 0) {
    const { picked } = allPicked(
      base({ primaryTrack: "bodyweight", hasAllEquipment: false, equipmentIds: [], daysPerWeek: 5 }),
    );
    const patterns = new Set(picked.map((e) => e.movement_pattern));
    check("plan includes horizontal pull", patterns.has("horizontal_pull"));
    check("plan includes vertical press", patterns.has("vertical_press"));
  } else {
    console.log("  note skipping plan check until migrations are applied");
  }
}

console.log("\n18. Exercise ordering: compounds before isolation, core last");
{
  const { plan } = allPicked(base({ daysPerWeek: 4 }));
  const trainingDays = plan.days.filter((d) => d.exercises.length > 0);
  
  for (const day of trainingDays) {
    const exercises = day.exercises.map((e) => byId.get(e.exerciseId)!);
    let seenCore = false;
    let seenIsolation = false;
    let orderingOk = true;
    
    for (const ex of exercises) {
      // Core exercises should be at the end
      if (seenCore && ex.movement_pattern !== "core") {
        orderingOk = false;
        check(`${day.label}: no non-core after core`, false, 
          `${ex.name} (${ex.movement_pattern}) after core exercise`);
      }
      
      // Isolation should not come before compounds (except for core which is always last)
      if (ex.movement_pattern !== "core") {
        if (seenIsolation && ex.mechanic === "compound") {
          orderingOk = false;
          check(`${day.label}: compounds before isolation`, false,
            `${ex.name} (compound) after isolation exercise`);
        }
      }
      
      seenCore = seenCore || ex.movement_pattern === "core";
      seenIsolation = seenIsolation || (ex.mechanic === "isolation" && ex.movement_pattern !== "core");
    }
    
    if (orderingOk) {
      check(`${day.label}: ordering is correct`, true);
    }
  }
}

console.log("\n19. Determinism: same inputs produce same plan");
{
  const input = base({ blockNumber: 5 });
  const plan1 = generateProgram(input);
  const plan2 = generateProgram(input);
  
  const day1Ex = plan1.days[0].exercises.map((e) => e.exerciseId);
  const day2Ex = plan2.days[0].exercises.map((e) => e.exerciseId);
  
  check("same exercises in same order", JSON.stringify(day1Ex) === JSON.stringify(day2Ex));
}

console.log("\n20. STAPLE_MOVEMENTS: every slug exists in catalogue");
{
  // Use the REAL STAPLE_MOVEMENTS from generate.ts, not a duplicate
  const allSlugs = new Set(catalogue.map((e) => e.slug));
  let allExist = true;

  for (const [pattern, slugs] of Object.entries(STAPLE_MOVEMENTS)) {
    for (const slug of slugs ?? []) {
      if (!allSlugs.has(slug)) {
        check(`${pattern} staple '${slug}' exists in catalogue`, false, "MISSING");
        allExist = false;
      }
    }
  }

  if (allExist) {
    check("all STAPLE_MOVEMENTS slugs exist in catalogue", true);
  }
}

console.log("\n21. Staple selection: beginners reliably get staples when eligible");
{
  // Test that a beginner with basic equipment gets push-ups, not a random exercise
  const beginnerHome = base({
    level: "beginner",
    primaryTrack: "bodyweight",
    hasAllEquipment: false,
    equipmentIds: [],
    daysPerWeek: 3,
  });

  const plan = generateProgram(beginnerHome);
  const picked = plan.days
    .flatMap((d) => d.exercises.map((e) => byId.get(e.exerciseId)!))
    .filter(Boolean);
  const slugs = picked.map((e) => e.slug);

  // Should get bodyweight staples like push-ups, squats, glute-bridge
  const hasHorizontalPressStaple = slugs.some((s) => ["pushups", "push-up-wide"].includes(s));
  const hasSquatStaple = slugs.includes("bodyweight-squat");

  check("beginner gets push-up staple", hasHorizontalPressStaple, `got: ${slugs.slice(0, 6).join(", ")}`);
  check("beginner gets squat staple", hasSquatStaple);

  // Verify determinism: same beginner profile should get the SAME staple every time
  const plan2 = generateProgram(beginnerHome);
  const slugs2 = plan2.days
    .flatMap((d) => d.exercises.map((e) => byId.get(e.exerciseId)!))
    .filter(Boolean)
    .map((e) => e.slug);

  check("staple selection is deterministic", JSON.stringify(slugs) === JSON.stringify(slugs2));
}

console.log("\n22. Intermediate 4-day 45-min gym: QA production review test");
{
  // Test the exact profile from the QA production review (bot1-p4-plan-review.md):
  // "build muscle, intermediate, gym equipment, 4 days, 45 min"
  const intermediate45 = base({
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "weights",
    hasAllEquipment: true,
    daysPerWeek: 4,
    preferredSessionMinutes: 45,
  });

  const plan = generateProgram(intermediate45);
  const days = plan.days;

  // Collect all exercises
  const allExercises = days.flatMap((d) =>
    d.exercises.map((e) => ({
      ...e,
      ex: byId.get(e.exerciseId)!,
      day: d.label,
      orderIndex: e.orderIndex,
    }))
  );

  // Build slug set for quick checking
  const allSlugs = new Set(allExercises.map((e) => e.ex.slug));

  // CRITICAL checks per QA review

  // C1: No plyometric or Olympic lifts in main slots (orderIndex 0-1)
  const mainSlotExercises = allExercises.filter((e) => e.orderIndex <= 1);
  const problematicMain = mainSlotExercises.filter((e) =>
    ["dumbbell-seated-box-jump", "power-clean", "smith-machine-hang-power-clean"].includes(e.ex.slug)
  );
  check(
    "no plyometric/Olympic lifts in main slots",
    problematicMain.length === 0,
    problematicMain.length > 0 ? `found: ${problematicMain.map((e) => e.ex.name).join(", ")}` : undefined
  );

  // C2: No behind-the-neck variants in main slots
  const behindNeckMain = mainSlotExercises.filter((e) =>
    ["wide-grip-rear-pull-up", "wide-grip-pulldown-behind-the-neck", 
     "standing-barbell-press-behind-neck"].includes(e.ex.slug)
  );
  check(
    "no behind-the-neck variants in main slots",
    behindNeckMain.length === 0,
    behindNeckMain.length > 0 ? `found: ${behindNeckMain.map((e) => e.ex.name).join(", ")}` : undefined
  );

  // H1: Must have at least one overhead press (vertical_press compound) in the week
  const overheadPress = allExercises.filter(
    (e) => e.ex.movement_pattern === "vertical_press" && e.ex.mechanic === "compound"
  );
  check(
    "has overhead press in week",
    overheadPress.length > 0,
    overheadPress.length > 0 ? `found: ${overheadPress[0].ex.name}` : "none found"
  );

  // H4: Primary horizontal press should be proper bench press
  const mainHPress = mainSlotExercises.filter((e) => e.ex.movement_pattern === "horizontal_press");
  const goodBench = mainHPress.some((e) =>
    ["barbell-bench-press-medium-grip", "dumbbell-bench-press", 
     "incline-dumbbell-press", "barbell-incline-bench-press"].includes(e.ex.slug)
  );
  check(
    "primary press is proper bench",
    goodBench,
    mainHPress.length > 0 ? `got: ${mainHPress.map((e) => e.ex.name).join(", ")}` : "no press found"
  );

  // Main slots should have staples
  const mainSlugs = mainSlotExercises.map((e) => e.ex.slug);
  const stapleSlugs = [
    "barbell-bench-press-medium-grip",
    "barbell-squat",
    "barbell-deadlift",
    "bent-over-barbell-row",
    "wide-grip-lat-pulldown",
    "chin-up",
    "standing-military-press",
  ];
  const hasStaples = mainSlugs.some((s) => stapleSlugs.includes(s));
  check("main slots include staples", hasStaples, `main slugs: ${mainSlugs.join(", ")}`);

  // Coverage checks: should have some direct arm, delt, and core work
  const armWork = allExercises.filter((e) =>
    e.ex.primary_muscles.some((m: string) => ["biceps", "triceps"].includes(m))
  );
  const deltWork = allExercises.filter((e) =>
    e.ex.primary_muscles.includes("delts" as any) || e.ex.movement_pattern === "vertical_press"
  );
  const coreWork = allExercises.filter((e) => e.ex.movement_pattern === "core");

  check(
    "has direct arm work (45 min should keep coverage)",
    armWork.length > 0,
    `found ${armWork.length} arm exercises`
  );
  check(
    "has delt work",
    deltWork.length > 0,
    `found ${deltWork.length} delt exercises`
  );
  check(
    "has core work",
    coreWork.length > 0,
    `found ${coreWork.length} core exercises`
  );

  // Determinism: same profile should produce same plan
  const plan2 = generateProgram(intermediate45);
  const slugs1 = allExercises.map((e) => e.ex.slug).join(",");
  const slugs2 = plan2.days
    .flatMap((d) => d.exercises.map((e) => byId.get(e.exerciseId)!.slug))
    .join(",");
  check("intermediate 45-min plan is deterministic", slugs1 === slugs2);
}

console.log("\n23. P1 regression: beginner bodyweight with knee + lower back injury");
{
  // Profile P1 from pass 5: fat loss, beginner, bodyweight (no equipment),
  // 3 days, with current knee and lower back injuries.
  const p1 = base({
    goal: "fat_loss",
    level: "beginner",
    primaryTrack: "bodyweight",
    hasAllEquipment: false,
    equipmentIds: [],
    daysPerWeek: 3,
    preferredSessionMinutes: 45,
    currentInjuryRegions: ["knee", "lower_back"],
  });

  const plan = generateProgram(p1);
  const allExercises = plan.days.flatMap((d) =>
    d.exercises.map((e) => ({
      ...e,
      ex: byId.get(e.exerciseId)!,
      day: d.label,
    }))
  );

  // CRITICAL: No contraindicated exercises for knee or lower back
  const contraindicated = allExercises.filter((e) =>
    e.ex.contraindicated_regions.some((r) => ["knee", "lower_back"].includes(r))
  );
  check(
    "P1: no knee or lower-back contraindicated exercises",
    contraindicated.length === 0,
    contraindicated.length > 0
      ? `found: ${contraindicated.map((e) => `${e.ex.name} (${e.ex.contraindicated_regions.join(", ")})`).join(", ")}`
      : undefined
  );

  // Should have at least some lower-body work via safe alternatives
  const lowerBody = allExercises.filter((e) =>
    e.ex.primary_muscles.some((m) => ["glutes", "hamstrings", "quads"].includes(m as string))
  );
  check(
    "P1: has some lower-body work via safe alternatives",
    lowerBody.length > 0,
    `found ${lowerBody.length} exercises: ${lowerBody.map((e) => e.ex.name).join(", ")}`
  );

  // Friday should not be just 2 exercises - minimum coverage check
  const friday = plan.days.find((d) => d.label.includes("FB C"));
  if (friday) {
    check(
      "P1: Friday has reasonable exercise count (not just 2)",
      friday.exercises.length >= 3,
      `got ${friday.exercises.length} exercises`
    );
  }

  // Staples in main slots for bodyweight users
  const mainSlots = allExercises.filter((e) => e.orderIndex <= 1);
  const bodyweightStaples = ["pushups", "push-up-wide", "inverted-row", "pike-push-up", "glute-bridge"];
  const hasBodyweightStaple = mainSlots.some((e) => bodyweightStaples.includes(e.ex.slug));
  check(
    "P1: main slots include bodyweight staples",
    hasBodyweightStaple,
    `main exercises: ${mainSlots.map((e) => e.ex.slug).join(", ")}`
  );
}

console.log("\n24. P2 regression: advanced gym user, 6 days, no injuries");
{
  // Profile P2 from pass 5: strength, expert, all gym equipment, 6 days
  const p2 = base({
    goal: "strength",
    level: "expert",
    primaryTrack: "weights",
    hasAllEquipment: true,
    daysPerWeek: 6,
    preferredSessionMinutes: 45,
    currentInjuryRegions: [],
  });

  const plan = generateProgram(p2);
  const allExercises = plan.days.flatMap((d) =>
    d.exercises.map((e) => ({
      ...e,
      ex: byId.get(e.exerciseId)!,
      day: d.label,
    }))
  );

  // CRITICAL: Main lifts should be strength staples (squat, bench, deadlift, OHP)
  const mainSlots = allExercises.filter((e) => e.orderIndex <= 1);
  const strengthStaples = [
    "barbell-squat",
    "barbell-bench-press-medium-grip",
    "barbell-deadlift",
    "standing-military-press",
    "bent-over-barbell-row",
    "wide-grip-lat-pulldown",
    "chin-up",
  ];
  const mainSlugs = mainSlots.map((e) => e.ex.slug);
  const hasStrengthStaples = mainSlugs.some((s) => strengthStaples.includes(s));
  check(
    "P2: main slots include strength staples",
    hasStrengthStaples,
    `main slugs: ${mainSlugs.join(", ")}`
  );

  // No plyometric or Olympic lifts in main slots for strength
  const problematicMain = mainSlots.filter((e) =>
    ["plyo", "snatch", "clean", "jerk", "jump"].some((keyword) =>
      e.ex.name.toLowerCase().includes(keyword)
    )
  );
  check(
    "P2: no plyometric/Olympic lifts in main slots",
    problematicMain.length === 0,
    problematicMain.length > 0
      ? `found: ${problematicMain.map((e) => e.ex.name).join(", ")}`
      : undefined
  );

  // Should have arm and core work even at 45 min (coverage requirement)
  const armWork = allExercises.filter((e) =>
    e.ex.primary_muscles.some((m) => ["biceps", "triceps"].includes(m as string))
  );
  const coreWork = allExercises.filter((e) => e.ex.movement_pattern === "core");
  check(
    "P2: has arm work at 45 min",
    armWork.length > 0,
    `found ${armWork.length} arm exercises`
  );
  check(
    "P2: has core work at 45 min",
    coreWork.length > 0,
    `found ${coreWork.length} core exercises`
  );
}

console.log("\n25. P3 regression: intermediate dumbbells with shoulder injury");
{
  // Profile P3 from pass 5: muscle gain, intermediate, bodyweight track
  // (dumbbells + bench), 5 days (1 yoga), current shoulder injury
  const p3 = base({
    goal: "muscle_gain",
    level: "intermediate",
    primaryTrack: "bodyweight",
    hasAllEquipment: false,
    equipmentIds: ["dumbbell", "adjustable_bench"],
    daysPerWeek: 5,
    yogaDaysPerWeek: 1,
    preferredSessionMinutes: 45,
    currentInjuryRegions: ["shoulder"],
  });

  const plan = generateProgram(p3);
  const allExercises = plan.days.flatMap((d) =>
    d.exercises.map((e) => ({
      ...e,
      ex: byId.get(e.exerciseId)!,
      day: d.label,
    }))
  );

  // CRITICAL: No shoulder-contraindicated exercises
  const shoulderContra = allExercises.filter((e) =>
    e.ex.contraindicated_regions.includes("shoulder" as any)
  );
  check(
    "P3: no shoulder-contraindicated exercises",
    shoulderContra.length === 0,
    shoulderContra.length > 0
      ? `found: ${shoulderContra.map((e) => e.ex.name).join(", ")}`
      : undefined
  );

  // No pullovers, overhead front raises, or snatches
  const problematicSlugs = [
    "pullover",
    "straight-arm-dumbbell-pullover",
    "standing-dumbbell-straight-arm-front-delt-raise-above-head",
    "single-dumbbell-raise",
    "snatch",
  ];
  const problematic = allExercises.filter((e) =>
    problematicSlugs.some((slug) => e.ex.slug.includes(slug))
  );
  check(
    "P3: no pullovers, overhead raises, or snatches",
    problematic.length === 0,
    problematic.length > 0 ? `found: ${problematic.map((e) => e.ex.name).join(", ")}` : undefined
  );

  // Should have staples appropriate for dumbbell training
  const mainSlots = allExercises.filter((e) => e.orderIndex <= 1);
  const dumbbellStaples = [
    "dumbbell-bench-press",
    "incline-dumbbell-press",
    "goblet-squat",
    "dumbbell-squat",
    "romanian-deadlift",
    "one-arm-dumbbell-row",
  ];
  const mainSlugs = mainSlots.map((e) => e.ex.slug);
  const hasDumbbellStaple = mainSlugs.some((s) =>
    dumbbellStaples.some((staple) => s.includes(staple) || staple.includes(s))
  );
  check(
    "P3: main slots include dumbbell-appropriate staples",
    hasDumbbellStaple,
    `main slugs: ${mainSlugs.join(", ")}`
  );

  // No jumps or cleans in main slots (hypertrophy, not power)
  const jumpClean = mainSlots.filter((e) =>
    ["jump", "clean"].some((keyword) => e.ex.name.toLowerCase().includes(keyword))
  );
  check(
    "P3: no jumps or cleans in main slots",
    jumpClean.length === 0,
    jumpClean.length > 0 ? `found: ${jumpClean.map((e) => e.ex.name).join(", ")}` : undefined
  );
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
