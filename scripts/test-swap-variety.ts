/**
 * Tests for swap variety with safety exclusions (QA Task U3 + L-8).
 * 
 * Requirements:
 * 1. Hard-coded exclusions: 5 dangerous exercises
 * 2. Pullover exclusion for compound pulls (except pullover originals)
 * 3. All-catalogue comparison against main baseline (hard-coded snapshot from main 25d92f8)
 * 4. Oracle checks for 4 key exercises
 * 5. Direct unit tests for each excluded slug
 * 6. Pullover scope tests with direct pools
 *
 *   npm run test:swap-variety
 */
import { readFileSync } from "fs";
import { rankAlternatives, buildPatternList, type AlternativesContext, type ExerciseRow } from "../src/lib/program/alternatives";
import { score, hashString } from "../src/lib/program/generate";
import type { Database } from "../src/lib/database.types";

type Level = Database["public"]["Enums"]["fitness_level"];
type BodyRegion = Database["public"]["Enums"]["body_region"];

const catalogueRaw = JSON.parse(readFileSync("scripts/fixtures/catalogue.json", "utf8"));
const catalogue: ExerciseRow[] = catalogueRaw;

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` (${detail})` : ""}`);
}

// Equipment profiles for all-catalogue testing
const EQUIPMENT_PROFILES: Record<string, Set<string> | null> = {
  "full-gym": null,
  "home-dumbbell-bands": new Set(["dumbbell", "resistance_band", "adjustable_bench"]),
  "cable-dumbbell": new Set(["cable_machine", "dumbbell"]),
  "pullup-bar-only": new Set(["pull_up_bar"]),
  "bodyweight": new Set([]),
  "barbell-rack": new Set(["barbell", "squat_rack", "flat_bench"]),
};

const LEVELS: Level[] = ["beginner", "intermediate", "expert"];
const INJURY_SCENARIOS: { label: string; regions: BodyRegion[] }[] = [
  { label: "none", regions: [] },
  { label: "shoulder", regions: ["shoulder"] },
  { label: "neck", regions: ["neck"] },
  { label: "knee", regions: ["knee"] },
  { label: "lower_back", regions: ["lower_back"] },
];
const TIE_BREAK_SEEDS = ["seed-1", "seed-2", "seed-3"];

console.log("\n1. Oracle check: Lat Pulldown (wide-grip-lat-pulldown, full gym)");
{
  const current = catalogue.find((e) => e.slug === "wide-grip-lat-pulldown");
  check("exercise found", !!current);
  
  if (current) {
    const patterns = buildPatternList(current.movement_pattern, false);
    const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern));
    
    const wantCompound = current.mechanic !== "isolation";
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn: (e) => score(e, wantCompound, "intermediate", "weights"),
      tieBreakFn: (slug) => hashString(`seid-test:${slug}`),
    };
    
    const alternatives = rankAlternatives(current, pool, ctx);
    const slugs = alternatives.map(e => e.slug);
    
    // Oracle computed with production scoring at 7c6edda5
    const expected = [
      "one-arm-lat-pulldown",
      "v-bar-pulldown",
      "underhand-cable-pulldowns",
      "close-grip-front-lat-pulldown",
      "full-range-of-motion-lat-pulldown",
    ];
    
    console.log(`  Got: ${slugs.join(", ")}`);
    check("matches oracle", JSON.stringify(slugs) === JSON.stringify(expected));
    check("no pullovers", slugs.every(s => !s.includes("pullover")));
  }
}

console.log("\n2. Oracle check: Barbell Bench Press (barbell-bench-press-medium-grip, full gym)");
{
  const current = catalogue.find((e) => e.slug === "barbell-bench-press-medium-grip");
  check("exercise found", !!current);
  
  if (current) {
    const patterns = buildPatternList(current.movement_pattern, false);
    const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern));
    
    const wantCompound = current.mechanic !== "isolation";
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn: (e) => score(e, wantCompound, "intermediate", "weights"),
      tieBreakFn: (slug) => hashString(`seid-test:${slug}`),
    };
    
    const alternatives = rankAlternatives(current, pool, ctx);
    const slugs = alternatives.map(e => e.slug);
    
    // Oracle computed with production scoring at 7c6edda5
    const expected = [
      "decline-barbell-bench-press",
      "barbell-incline-bench-press-medium-grip",
      "wide-grip-barbell-bench-press",
      "reverse-triceps-bench-press",
      "reverse-band-bench-press",
    ];
    
    console.log(`  Got: ${slugs.join(", ")}`);
    check("matches oracle", JSON.stringify(slugs) === JSON.stringify(expected));
    check("no guillotine", !slugs.includes("barbell-guillotine-bench-press"));
    check("no neck-press", !slugs.includes("neck-press"));
  }
}

console.log("\n3. Oracle check: Barbell Squat (barbell-squat, full gym)");
{
  const current = catalogue.find((e) => e.slug === "barbell-squat");
  check("exercise found", !!current);
  
  if (current) {
    const patterns = buildPatternList(current.movement_pattern, false);
    const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern));
    
    const wantCompound = current.mechanic !== "isolation";
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn: (e) => score(e, wantCompound, "intermediate", "weights"),
      tieBreakFn: (slug) => hashString(`seid-test:${slug}`),
    };
    
    const alternatives = rankAlternatives(current, pool, ctx);
    const slugs = alternatives.map(e => e.slug);
    
    // Oracle computed with production scoring at 7c6edda5
    const expected = [
      "wide-stance-barbell-squat",
      "reverse-band-box-squat",
      "front-squat-clean-grip",
      "box-squat",
      "barbell-hack-squat",
    ];
    
    console.log(`  Got: ${slugs.join(", ")}`);
    check("matches oracle", JSON.stringify(slugs) === JSON.stringify(expected));
  }
}

console.log("\n4. Oracle check: Seated Cable Rows (seated-cable-rows, full gym)");
{
  const current = catalogue.find((e) => e.slug === "seated-cable-rows");
  check("exercise found", !!current);
  
  if (current) {
    const patterns = buildPatternList(current.movement_pattern, false);
    const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern));
    
    const wantCompound = current.mechanic !== "isolation";
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn: (e) => score(e, wantCompound, "intermediate", "weights"),
      tieBreakFn: (slug) => hashString(`seid-test:${slug}`),
    };
    
    const alternatives = rankAlternatives(current, pool, ctx);
    const slugs = alternatives.map(e => e.slug);
    
    // Oracle computed with production scoring at 7c6edda5
    const expected = [
      "seated-one-arm-cable-pulley-rows",
      "kneeling-single-arm-high-pulley-row",
      "cable-rope-rear-delt-rows",
      "kneeling-high-pulley-row",
      "low-pulley-row-to-neck",
    ];
    
    console.log(`  Got: ${slugs.join(", ")}`);
    check("matches oracle", JSON.stringify(slugs) === JSON.stringify(expected));
    check("no pullovers", slugs.every(s => !s.includes("pullover")));
  }
}

console.log("\n5. All-catalogue check: head == main baseline (hard-coded snapshot from main 25d92f8)");
{
  // Load pre-computed baseline from main 25d92f8 with exclusions pre-filtered
  const baselineData = JSON.parse(readFileSync("scripts/fixtures/main-baseline.json", "utf8"));
  const baselineMap = new Map<string, string>();
  
  for (const entry of baselineData) {
    const key = `${entry.exercise}|${entry.level}|${entry.equipment}|${entry.injuries}|${entry.seed}`;
    baselineMap.set(key, entry.alternatives.join(","));
  }
  
  let totalLists = 0;
  let diffCount = 0;
  
  for (const exercise of catalogue) {
    const patterns = buildPatternList(exercise.movement_pattern, false);
    const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern));
    
    for (const [profileName, equipment] of Object.entries(EQUIPMENT_PROFILES)) {
      for (const level of LEVELS) {
        for (const { label: injuryLabel, regions } of INJURY_SCENARIOS) {
          for (const seed of TIE_BREAK_SEEDS) {
            const wantCompound = exercise.mechanic !== "isolation";
            const ctx: AlternativesContext = {
              level,
              availableEquipment: equipment,
              injuryRegions: regions,
              limit: 5,
              scoreFn: (e) => score(e, wantCompound, level, "weights"),
              tieBreakFn: (slug) => hashString(`${seed}:${slug}`),
            };
            
            const head = rankAlternatives(exercise, pool, ctx);
            const headSlugs = head.map(e => e.slug).join(",");
            
            const key = `${exercise.slug}|${level}|${profileName}|${injuryLabel}|${seed}`;
            const baseSlugs = baselineMap.get(key) || "";
            
            totalLists++;
            
            if (headSlugs !== baseSlugs) {
              diffCount++;
              if (diffCount <= 3) {
                console.log(`  Diff: ${exercise.slug} (${profileName},${level},${injuryLabel},${seed})`);
                console.log(`    Baseline: ${baseSlugs}`);
                console.log(`    Head: ${headSlugs}`);
              }
            }
          }
        }
      }
    }
  }
  
  check(`checked ${totalLists} lists`, totalLists > 0);
  check("head == baseline", diffCount === 0, `${diffCount} diffs`);
}

console.log("\n6. Direct unit tests: each excluded slug");
{
  // Test standing-barbell-press-behind-neck
  const press = catalogue.find(e => e.slug === "barbell-shoulder-press");
  const btnek = catalogue.find(e => e.slug === "standing-barbell-press-behind-neck");
  const dbPress = catalogue.find(e => e.slug === "dumbbell-shoulder-press");
  
  if (press && btnek && dbPress) {
    const pool = [press, btnek, dbPress];
    const wantCompound = press.mechanic !== "isolation";
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn: (e) => score(e, wantCompound, "intermediate", "weights"),
      tieBreakFn: (slug) => hashString(`test:${slug}`),
    };
    
    const alternatives = rankAlternatives(press, pool, ctx);
    const slugs = alternatives.map(e => e.slug);
    
    check("standing-barbell-press-behind-neck excluded", !slugs.includes("standing-barbell-press-behind-neck"));
    check("dumbbell-shoulder-press present", slugs.includes("dumbbell-shoulder-press"));
  }
  
  // Test wide-grip-pulldown-behind-the-neck
  const latPull = catalogue.find(e => e.slug === "wide-grip-lat-pulldown");
  const btneck = catalogue.find(e => e.slug === "wide-grip-pulldown-behind-the-neck");
  const closeLat = catalogue.find(e => e.slug === "close-grip-front-lat-pulldown");
  
  if (latPull && btneck && closeLat) {
    const pool = [latPull, btneck, closeLat];
    const wantCompound = latPull.mechanic !== "isolation";
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn: (e) => score(e, wantCompound, "intermediate", "weights"),
      tieBreakFn: (slug) => hashString(`test:${slug}`),
    };
    
    const alternatives = rankAlternatives(latPull, pool, ctx);
    const slugs = alternatives.map(e => e.slug);
    
    check("wide-grip-pulldown-behind-the-neck excluded", !slugs.includes("wide-grip-pulldown-behind-the-neck"));
    check("close-grip-front-lat-pulldown present", slugs.includes("close-grip-front-lat-pulldown"));
  }
  
  // Test wide-grip-rear-pull-up
  const pullUp = catalogue.find(e => e.slug === "pullups");
  const rearPullUp = catalogue.find(e => e.slug === "wide-grip-rear-pull-up");
  const chinUp = catalogue.find(e => e.slug === "chin-up");
  
  if (pullUp && rearPullUp && chinUp) {
    const pool = [pullUp, rearPullUp, chinUp];
    const wantCompound = pullUp.mechanic !== "isolation";
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn: (e) => score(e, wantCompound, "intermediate", "weights"),
      tieBreakFn: (slug) => hashString(`test:${slug}`),
    };
    
    const alternatives = rankAlternatives(pullUp, pool, ctx);
    const slugs = alternatives.map(e => e.slug);
    
    check("wide-grip-rear-pull-up excluded", !slugs.includes("wide-grip-rear-pull-up"));
    check("chin-up present", slugs.includes("chin-up"));
  }
  
  // Test barbell-guillotine-bench-press
  const bench = catalogue.find(e => e.slug === "barbell-bench-press-medium-grip");
  const guillotine = catalogue.find(e => e.slug === "barbell-guillotine-bench-press");
  const incline = catalogue.find(e => e.slug === "barbell-incline-bench-press-medium-grip");
  
  if (bench && guillotine && incline) {
    const pool = [bench, guillotine, incline];
    const wantCompound = bench.mechanic !== "isolation";
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn: (e) => score(e, wantCompound, "intermediate", "weights"),
      tieBreakFn: (slug) => hashString(`test:${slug}`),
    };
    
    const alternatives = rankAlternatives(bench, pool, ctx);
    const slugs = alternatives.map(e => e.slug);
    
    check("barbell-guillotine-bench-press excluded", !slugs.includes("barbell-guillotine-bench-press"));
    check("barbell-incline-bench-press-medium-grip present", slugs.includes("barbell-incline-bench-press-medium-grip"));
  }
  
  // Test neck-press
  const neckPressBench = catalogue.find(e => e.slug === "barbell-bench-press-medium-grip");
  const neckPress = catalogue.find(e => e.slug === "neck-press");
  const inclineBench = catalogue.find(e => e.slug === "barbell-incline-bench-press-medium-grip");
  
  if (neckPressBench && neckPress && inclineBench) {
    const pool = [neckPressBench, neckPress, inclineBench];
    const wantCompound = neckPressBench.mechanic !== "isolation";
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn: (e) => score(e, wantCompound, "intermediate", "weights"),
      tieBreakFn: (slug) => hashString(`test:${slug}`),
    };
    
    const alternatives = rankAlternatives(neckPressBench, pool, ctx);
    const slugs = alternatives.map(e => e.slug);
    
    check("neck-press excluded", !slugs.includes("neck-press"));
    check("barbell-incline-bench-press-medium-grip present (neck-press test)", slugs.includes("barbell-incline-bench-press-medium-grip"));
  }
}

console.log("\n7. Pullover scope tests");
{
  // Test (a): Press original with pullover in same pattern
  // front-raise-and-pullover is horizontal_press, so it can be in bench pool
  const bench = catalogue.find(e => e.slug === "barbell-bench-press-medium-grip");
  const frontRaisePullover = catalogue.find(e => e.slug === "front-raise-and-pullover");
  const incline = catalogue.find(e => e.slug === "barbell-incline-bench-press-medium-grip");
  
  if (bench && frontRaisePullover && incline) {
    const pool = [bench, frontRaisePullover, incline];
    const wantCompound = bench.mechanic !== "isolation";
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn: (e) => score(e, wantCompound, "intermediate", "weights"),
      tieBreakFn: (slug) => hashString(`test:${slug}`),
    };
    
    const alternatives = rankAlternatives(bench, pool, ctx);
    const slugs = alternatives.map(e => e.slug);
    
    check("press original can get pullover", slugs.includes("front-raise-and-pullover"));
  }
  
  // Test (b): Isolation pull CAN get pullover
  const straightArm = catalogue.find(e => e.slug === "straight-arm-pulldown");
  const bentArmPullover = catalogue.find(e => e.slug === "bent-arm-barbell-pullover");
  const latRaise = catalogue.find(e => e.slug === "v-bar-pulldown");
  
  if (straightArm && bentArmPullover && latRaise) {
    const pool = [straightArm, bentArmPullover, latRaise];
    const wantCompound = straightArm.mechanic !== "isolation";
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn: (e) => score(e, wantCompound, "intermediate", "weights"),
      tieBreakFn: (slug) => hashString(`test:${slug}`),
    };
    
    const alternatives = rankAlternatives(straightArm, pool, ctx);
    const slugs = alternatives.map(e => e.slug);
    
    check("isolation pull can get pullover", slugs.includes("bent-arm-barbell-pullover"));
  }
  
  // Test (c): Compound vertical pull CANNOT get pullover
  const latPull = catalogue.find(e => e.slug === "wide-grip-lat-pulldown");
  const pulloverForTest = catalogue.find(e => e.slug === "bent-arm-barbell-pullover");
  const validAlt = catalogue.find(e => e.slug === "close-grip-front-lat-pulldown");
  
  if (latPull && pulloverForTest && validAlt) {
    const pool = [latPull, pulloverForTest, validAlt];
    const wantCompound = latPull.mechanic !== "isolation";
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn: (e) => score(e, wantCompound, "intermediate", "weights"),
      tieBreakFn: (slug) => hashString(`test:${slug}`),
    };
    
    const alternatives = rankAlternatives(latPull, pool, ctx);
    const slugs = alternatives.map(e => e.slug);
    
    check("compound vertical pull cannot get pullover", !slugs.includes("bent-arm-barbell-pullover"));
    check("valid alternative present", slugs.includes("close-grip-front-lat-pulldown"));
  }
  
  // Test (d): Pullover original CAN get other pullovers
  const originalPullover = catalogue.find(e => e.slug === "bent-arm-barbell-pullover");
  
  if (originalPullover) {
    // Create a synthetic pullover in the same pattern
    const syntheticPullover = {
      ...originalPullover,
      id: "test-pullover-id",
      slug: "test-pullover",
      name: "Test Pullover",
    };
    const validAlt2 = catalogue.find(e => e.slug === "close-grip-front-lat-pulldown");
    
    if (validAlt2) {
      const pool = [originalPullover, syntheticPullover, validAlt2];
      const wantCompound = originalPullover.mechanic !== "isolation";
      const ctx: AlternativesContext = {
        level: "intermediate",
        availableEquipment: null,
        injuryRegions: [],
        limit: 5,
        scoreFn: (e) => score(e, wantCompound, "intermediate", "weights"),
        tieBreakFn: (slug) => hashString(`test:${slug}`),
      };
      
      const alternatives = rankAlternatives(originalPullover, pool, ctx);
      const slugs = alternatives.map(e => e.slug);
      
      check("pullover original can get other pullovers", slugs.includes("test-pullover"));
    }
  }
}

if (failures === 0) {
  console.log("\n✓ All tests passed\n");
  process.exit(0);
} else {
  console.log(`\n✗ ${failures} test(s) failed\n`);
  process.exit(1);
}
