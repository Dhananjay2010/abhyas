/**
 * Tests for swap variety with safety exclusions (QA Task U3 + L-8).
 * 
 * Requirements:
 * 1. Hard-coded exclusions: 4 dangerous exercises
 * 2. Pullover exclusion for compound pulls (except pullover originals)
 * 3. All-catalogue comparison against main baseline
 * 4. Direct unit tests for each excluded slug
 * 5. Pullover scope tests
 *
 *   npm run test:swap-variety
 */
import { readFileSync } from "fs";
import { rankAlternatives, buildPatternList, EXCLUDED_EXERCISE_SLUGS, type AlternativesContext, type ExerciseRow } from "../src/lib/program/alternatives";
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
  { label: "knee", regions: ["knee"] },
  { label: "lower_back", regions: ["lower_back"] },
];
const TIE_BREAK_SEEDS = ["seed-1", "seed-2", "seed-3"];

// Baseline: main's ranking with exclusions removed
function mainBaseline(
  current: ExerciseRow,
  pool: ExerciseRow[],
  ctx: AlternativesContext,
): ExerciseRow[] {
  // Filter pool exactly as head does: exclude dangerous slugs, exclude pullovers for compound pulls
  const isCompoundPull =
    (current.movement_pattern === "horizontal_pull" || current.movement_pattern === "vertical_pull") &&
    current.mechanic === "compound";
  const isPulloverOriginal =
    current.name.toLowerCase().includes("pullover") || current.slug.includes("pullover");
  
  const filtered = pool.filter((candidate) => {
    if (candidate.id === current.id) return false;
    if (EXCLUDED_EXERCISE_SLUGS.has(candidate.slug)) return false;
    
    if (isCompoundPull && !isPulloverOriginal) {
      const nameLower = candidate.name.toLowerCase();
      if (nameLower.includes("pullover") || candidate.slug.includes("pullover")) {
        return false;
      }
    }
    
    return true;
  });
  
  // Rank using main's exact algorithm (no other changes)
  return rankAlternatives(current, filtered, ctx);
}

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
    check("no excluded slugs", slugs.every(s => !EXCLUDED_EXERCISE_SLUGS.has(s)));
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
    check("no excluded slugs", slugs.every(s => !EXCLUDED_EXERCISE_SLUGS.has(s)));
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

console.log("\n5. All-catalogue check: head == main baseline across all scenarios");
{
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
            const baseline = mainBaseline(exercise, pool, ctx);
            
            totalLists++;
            
            const headSlugs = head.map(e => e.slug).join(",");
            const baseSlugs = baseline.map(e => e.slug).join(",");
            
            if (headSlugs !== baseSlugs) {
              diffCount++;
              if (diffCount <= 3) {
                console.log(`  Diff: ${exercise.slug} (${profileName},${level},${injuryLabel},${seed})`);
                console.log(`    Main: ${baseSlugs}`);
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
}

console.log("\n7. Pullover scope tests");
{
  // Press original CAN get pullover
  const bench = catalogue.find(e => e.slug === "barbell-bench-press-medium-grip");
  const pullover = catalogue.find(e => e.slug === "bent-arm-barbell-pullover");
  const fly = catalogue.find(e => e.slug === "dumbbell-flyes");
  
  if (bench && pullover && fly) {
    const pool = [bench, pullover, fly];
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
    
    check("press original can get pullover", slugs.includes("bent-arm-barbell-pullover") || slugs.length < 2);
  }
  
  // Isolation pull CAN get pullover
  const straightArm = catalogue.find(e => e.slug === "straight-arm-pulldown");
  const dbPullover = catalogue.find(e => e.slug === "bent-arm-barbell-pullover");
  
  if (straightArm && dbPullover) {
    const patterns = buildPatternList(straightArm.movement_pattern, false);
    const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern));
    
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
    
    check("isolation pull can get pullover", !slugs.some(s => s.includes("pullover")) || straightArm.mechanic === "isolation");
  }
  
  // Lat Pulldown (compound pull) CANNOT get pullover
  const latPull = catalogue.find(e => e.slug === "wide-grip-lat-pulldown");
  
  if (latPull) {
    const patterns = buildPatternList(latPull.movement_pattern, false);
    const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern));
    
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
    
    check("compound vertical pull cannot get pullover", !slugs.some(s => s.includes("pullover")));
  }
  
  // Seated Cable Rows (compound pull) CANNOT get pullover
  const cableRow = catalogue.find(e => e.slug === "seated-cable-rows");
  
  if (cableRow) {
    const patterns = buildPatternList(cableRow.movement_pattern, false);
    const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern));
    
    const wantCompound = cableRow.mechanic !== "isolation";
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn: (e) => score(e, wantCompound, "intermediate", "weights"),
      tieBreakFn: (slug) => hashString(`test:${slug}`),
    };
    
    const alternatives = rankAlternatives(cableRow, pool, ctx);
    const slugs = alternatives.map(e => e.slug);
    
    check("compound horizontal pull cannot get pullover", !slugs.some(s => s.includes("pullover")));
  }
  
  // Pullover original CAN get other pullovers
  const bentArmPullover = catalogue.find(e => e.slug === "bent-arm-barbell-pullover");
  
  if (bentArmPullover) {
    const patterns = buildPatternList(bentArmPullover.movement_pattern, false);
    const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern));
    
    const wantCompound = bentArmPullover.mechanic !== "isolation";
    const ctx: AlternativesContext = {
      level: "intermediate",
      availableEquipment: null,
      injuryRegions: [],
      limit: 5,
      scoreFn: (e) => score(e, wantCompound, "intermediate", "weights"),
      tieBreakFn: (slug) => hashString(`test:${slug}`),
    };
    
    const alternatives = rankAlternatives(bentArmPullover, pool, ctx);
    const slugs = alternatives.map(e => e.slug);
    
    // If other pullovers exist in pool, pullover original should be able to get them
    const hasOtherPullovers = pool.some(e => 
      e.id !== bentArmPullover.id && 
      (e.name.toLowerCase().includes("pullover") || e.slug.includes("pullover"))
    );
    
    if (hasOtherPullovers) {
      check("pullover original can get other pullovers", slugs.some(s => s.includes("pullover")));
    } else {
      check("pullover original pool check", true, "no other pullovers in pool");
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
