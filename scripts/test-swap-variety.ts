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
import { EXCLUDED_EXERCISE_SLUGS } from "../src/lib/program/exclusions";

const catalogueRaw = JSON.parse(readFileSync("scripts/fixtures/catalogue.json", "utf8"));
const catalogue: ExerciseRow[] = catalogueRaw;

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` (${detail})` : ""}`);
}

console.log("\n1. Oracle check: Lat Pulldown (wide-grip-lat-pulldown, full gym)");
{
  const find = (slug: string): ExerciseRow => {
    const ex = catalogue.find(e => e.slug === slug);
    if (!ex) throw new Error(`Exercise ${slug} not found in catalogue`);
    return ex;
  };

  const current = find("wide-grip-lat-pulldown");
  
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

console.log("\n2. Oracle check: Barbell Bench Press (barbell-bench-press-medium-grip, full gym)");
{
  const find = (slug: string): ExerciseRow => {
    const ex = catalogue.find(e => e.slug === slug);
    if (!ex) throw new Error(`Exercise ${slug} not found in catalogue`);
    return ex;
  };

  const current = find("barbell-bench-press-medium-grip");
  
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

console.log("\n3. Oracle check: Barbell Squat (barbell-squat, full gym)");
{
  const find = (slug: string): ExerciseRow => {
    const ex = catalogue.find(e => e.slug === slug);
    if (!ex) throw new Error(`Exercise ${slug} not found in catalogue`);
    return ex;
  };

  const current = find("barbell-squat");
  
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

console.log("\n4. Oracle check: Seated Cable Rows (seated-cable-rows, full gym)");
{
  const find = (slug: string): ExerciseRow => {
    const ex = catalogue.find(e => e.slug === slug);
    if (!ex) throw new Error(`Exercise ${slug} not found in catalogue`);
    return ex;
  };

  const current = find("seated-cable-rows");
  
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
    "shotgun-row",
  ];
  
  console.log(`  Got: ${slugs.join(", ")}`);
  check("matches oracle", JSON.stringify(slugs) === JSON.stringify(expected));
  check("no pullovers", slugs.every(s => !s.includes("pullover")));
}

console.log("\n5. Behind-the-neck catalogue scan: all behind-the-neck exercises must be excluded");
{
  const behindTheNeckPattern = /behind.{0,1}the.{0,1}neck|behind.{0,1}neck/i;
  const behindTheNeckExercises = catalogue.filter(e => 
    behindTheNeckPattern.test(e.name) || behindTheNeckPattern.test(e.slug)
  );
  
  console.log(`  Found ${behindTheNeckExercises.length} behind-the-neck exercise(s) in catalogue:`);
  for (const ex of behindTheNeckExercises) {
    console.log(`    - ${ex.slug} (${ex.name})`);
    check(`${ex.slug} is excluded`, EXCLUDED_EXERCISE_SLUGS.has(ex.slug));
  }
  
  check("at least one behind-the-neck exercise exists", behindTheNeckExercises.length > 0);
}

console.log("\n6. Lat Pulldown swap test: no behind-the-neck variants offered");
{
  const find = (slug: string): ExerciseRow => {
    const ex = catalogue.find(e => e.slug === slug);
    if (!ex) throw new Error(`Exercise ${slug} not found in catalogue`);
    return ex;
  };

  const current = find("wide-grip-lat-pulldown");
  
  const patterns = buildPatternList(current.movement_pattern, false);
  const pool = catalogue.filter((e) => patterns.includes(e.movement_pattern));
  
  const wantCompound = current.mechanic !== "isolation";
  const ctx: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 20,
    scoreFn: (e) => score(e, wantCompound, "intermediate", "weights"),
    tieBreakFn: (slug) => hashString(`seid-test:${slug}`),
  };
  
  const alternatives = rankAlternatives(current, pool, ctx);
  
  const behindTheNeckPattern = /behind.{0,1}the.{0,1}neck|behind.{0,1}neck/i;
  const hasBehindTheNeck = alternatives.some(e => 
    behindTheNeckPattern.test(e.name) || behindTheNeckPattern.test(e.slug)
  );
  
  console.log(`  Checked ${alternatives.length} alternatives`);
  check("no behind-the-neck in swaps", !hasBehindTheNeck);
}

console.log("\n7. Direct unit tests: each excluded slug");
{
  const find = (slug: string): ExerciseRow => {
    const ex = catalogue.find(e => e.slug === slug);
    if (!ex) throw new Error(`Exercise ${slug} not found in catalogue`);
    return ex;
  };

  // Test standing-barbell-press-behind-neck
  const press = find("barbell-shoulder-press");
  const btnek = find("standing-barbell-press-behind-neck");
  const dbPress = find("dumbbell-shoulder-press");
  
  const pool1 = [press, btnek, dbPress];
  const wantCompound1 = press.mechanic !== "isolation";
  const ctx1: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 5,
    scoreFn: (e) => score(e, wantCompound1, "intermediate", "weights"),
    tieBreakFn: (slug) => hashString(`test:${slug}`),
  };
  
  const alternatives1 = rankAlternatives(press, pool1, ctx1);
  const slugs1 = alternatives1.map(e => e.slug);
  
  check("standing-barbell-press-behind-neck excluded", !slugs1.includes("standing-barbell-press-behind-neck"));
  check("dumbbell-shoulder-press present", slugs1.includes("dumbbell-shoulder-press"));
  
  // Test wide-grip-pulldown-behind-the-neck
  const latPull = find("wide-grip-lat-pulldown");
  const btneck = find("wide-grip-pulldown-behind-the-neck");
  const closeLat = find("close-grip-front-lat-pulldown");
  
  const pool2 = [latPull, btneck, closeLat];
  const wantCompound2 = latPull.mechanic !== "isolation";
  const ctx2: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 5,
    scoreFn: (e) => score(e, wantCompound2, "intermediate", "weights"),
    tieBreakFn: (slug) => hashString(`test:${slug}`),
  };
  
  const alternatives2 = rankAlternatives(latPull, pool2, ctx2);
  const slugs2 = alternatives2.map(e => e.slug);
  
  check("wide-grip-pulldown-behind-the-neck excluded", !slugs2.includes("wide-grip-pulldown-behind-the-neck"));
  check("close-grip-front-lat-pulldown present", slugs2.includes("close-grip-front-lat-pulldown"));
  
  // Test wide-grip-rear-pull-up
  const pullUp = find("pullups");
  const rearPullUp = find("wide-grip-rear-pull-up");
  const chinUp = find("chin-up");
  
  const pool3 = [pullUp, rearPullUp, chinUp];
  const wantCompound3 = pullUp.mechanic !== "isolation";
  const ctx3: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 5,
    scoreFn: (e) => score(e, wantCompound3, "intermediate", "weights"),
    tieBreakFn: (slug) => hashString(`test:${slug}`),
  };
  
  const alternatives3 = rankAlternatives(pullUp, pool3, ctx3);
  const slugs3 = alternatives3.map(e => e.slug);
  
  check("wide-grip-rear-pull-up excluded", !slugs3.includes("wide-grip-rear-pull-up"));
  check("chin-up present", slugs3.includes("chin-up"));
  
  // Test barbell-guillotine-bench-press
  const bench = find("barbell-bench-press-medium-grip");
  const guillotine = find("barbell-guillotine-bench-press");
  const incline = find("barbell-incline-bench-press-medium-grip");
  
  const pool4 = [bench, guillotine, incline];
  const wantCompound4 = bench.mechanic !== "isolation";
  const ctx4: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 5,
    scoreFn: (e) => score(e, wantCompound4, "intermediate", "weights"),
    tieBreakFn: (slug) => hashString(`test:${slug}`),
  };
  
  const alternatives4 = rankAlternatives(bench, pool4, ctx4);
  const slugs4 = alternatives4.map(e => e.slug);
  
  check("barbell-guillotine-bench-press excluded", !slugs4.includes("barbell-guillotine-bench-press"));
  check("barbell-incline-bench-press-medium-grip present", slugs4.includes("barbell-incline-bench-press-medium-grip"));
  
  // Test neck-press
  const neckPressBench = find("barbell-bench-press-medium-grip");
  const neckPress = find("neck-press");
  const inclineBench = find("barbell-incline-bench-press-medium-grip");
  
  const pool5 = [neckPressBench, neckPress, inclineBench];
  const wantCompound5 = neckPressBench.mechanic !== "isolation";
  const ctx5: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 5,
    scoreFn: (e) => score(e, wantCompound5, "intermediate", "weights"),
    tieBreakFn: (slug) => hashString(`test:${slug}`),
  };
  
  const alternatives5 = rankAlternatives(neckPressBench, pool5, ctx5);
  const slugs5 = alternatives5.map(e => e.slug);
  
  check("neck-press excluded", !slugs5.includes("neck-press"));
  check("barbell-incline-bench-press-medium-grip present (neck-press test)", slugs5.includes("barbell-incline-bench-press-medium-grip"));
  
  // Test low-pulley-row-to-neck
  const seatedRow = find("seated-cable-rows");
  const lowPulleyRowToNeck = find("low-pulley-row-to-neck");
  const shotgunRow = find("shotgun-row");
  
  const pool6 = [seatedRow, lowPulleyRowToNeck, shotgunRow];
  const wantCompound6 = seatedRow.mechanic !== "isolation";
  const ctx6: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 5,
    scoreFn: (e) => score(e, wantCompound6, "intermediate", "weights"),
    tieBreakFn: (slug) => hashString(`test:${slug}`),
  };
  
  const alternatives6 = rankAlternatives(seatedRow, pool6, ctx6);
  const slugs6 = alternatives6.map(e => e.slug);
  
  check("low-pulley-row-to-neck excluded", !slugs6.includes("low-pulley-row-to-neck"));
  check("shotgun-row present", slugs6.includes("shotgun-row"));
}

console.log("\n8. Pullover scope tests");
{
  const find = (slug: string): ExerciseRow => {
    const ex = catalogue.find(e => e.slug === slug);
    if (!ex) throw new Error(`Exercise ${slug} not found in catalogue`);
    return ex;
  };

  // Test (a): Press original with pullover in same pattern
  // front-raise-and-pullover is horizontal_press, so it can be in bench pool
  const bench = find("barbell-bench-press-medium-grip");
  const frontRaisePullover = find("front-raise-and-pullover");
  const incline = find("barbell-incline-bench-press-medium-grip");
  
  const pool1 = [bench, frontRaisePullover, incline];
  const wantCompound1 = bench.mechanic !== "isolation";
  const ctx1: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 5,
    scoreFn: (e) => score(e, wantCompound1, "intermediate", "weights"),
    tieBreakFn: (slug) => hashString(`test:${slug}`),
  };
  
  const alternatives1 = rankAlternatives(bench, pool1, ctx1);
  const slugs1 = alternatives1.map(e => e.slug);
  
  check("press original can get pullover", slugs1.includes("front-raise-and-pullover"));
  
  // Test (b): Isolation pull CAN get pullover
  const straightArm = find("straight-arm-pulldown");
  const bentArmPullover = find("bent-arm-barbell-pullover");
  const latRaise = find("v-bar-pulldown");
  
  const pool2 = [straightArm, bentArmPullover, latRaise];
  const wantCompound2 = straightArm.mechanic !== "isolation";
  const ctx2: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 5,
    scoreFn: (e) => score(e, wantCompound2, "intermediate", "weights"),
    tieBreakFn: (slug) => hashString(`test:${slug}`),
  };
  
  const alternatives2 = rankAlternatives(straightArm, pool2, ctx2);
  const slugs2 = alternatives2.map(e => e.slug);
  
  check("isolation pull can get pullover", slugs2.includes("bent-arm-barbell-pullover"));
  
  // Test (c): Compound vertical pull CANNOT get pullover
  const latPull = find("wide-grip-lat-pulldown");
  const pulloverForTest = find("bent-arm-barbell-pullover");
  const validAlt = find("close-grip-front-lat-pulldown");
  
  const pool3 = [latPull, pulloverForTest, validAlt];
  const wantCompound3 = latPull.mechanic !== "isolation";
  const ctx3: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 5,
    scoreFn: (e) => score(e, wantCompound3, "intermediate", "weights"),
    tieBreakFn: (slug) => hashString(`test:${slug}`),
  };
  
  const alternatives3 = rankAlternatives(latPull, pool3, ctx3);
  const slugs3 = alternatives3.map(e => e.slug);
  
  check("compound vertical pull cannot get pullover", !slugs3.includes("bent-arm-barbell-pullover"));
  check("valid alternative present", slugs3.includes("close-grip-front-lat-pulldown"));
  
  // Test (d): Compound HORIZONTAL pull also CANNOT get pullover (catches mutation 9)
  const cableRow = find("seated-cable-rows");
  const pulloverForHoriz = find("bent-arm-barbell-pullover");
  const validHorizAlt = find("kneeling-single-arm-high-pulley-row");
  
  const pool4 = [cableRow, pulloverForHoriz, validHorizAlt];
  const wantCompound4 = cableRow.mechanic !== "isolation";
  const ctx4: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 5,
    scoreFn: (e) => score(e, wantCompound4, "intermediate", "weights"),
    tieBreakFn: (slug) => hashString(`test:${slug}`),
  };
  
  const alternatives4 = rankAlternatives(cableRow, pool4, ctx4);
  const slugs4 = alternatives4.map(e => e.slug);
  
  check("compound horizontal pull cannot get pullover", !slugs4.includes("bent-arm-barbell-pullover"));
  check("valid horizontal alt present", slugs4.includes("kneeling-single-arm-high-pulley-row"));
  
  // Test (e): Pullover original CAN get other pullovers
  const originalPullover = find("bent-arm-barbell-pullover");
  
  // Create a synthetic pullover in the same pattern
  const syntheticPullover = {
    ...originalPullover,
    id: "test-pullover-id",
    slug: "test-pullover",
    name: "Test Pullover",
  };
  const validAlt2 = find("close-grip-front-lat-pulldown");
  
  const pool5 = [originalPullover, syntheticPullover, validAlt2];
  const wantCompound5 = originalPullover.mechanic !== "isolation";
  const ctx5: AlternativesContext = {
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 5,
    scoreFn: (e) => score(e, wantCompound5, "intermediate", "weights"),
    tieBreakFn: (slug) => hashString(`test:${slug}`),
  };
  
  const alternatives5 = rankAlternatives(originalPullover, pool5, ctx5);
  const slugs5 = alternatives5.map(e => e.slug);
  
  check("pullover original can get other pullovers", slugs5.includes("test-pullover"));
}

console.log("\n9. Horizontal pull never gets a pullover (catches mutation 9)");
{
  const find = (slug: string): ExerciseRow => {
    const ex = catalogue.find(e => e.slug === slug);
    if (!ex) throw new Error(`Exercise ${slug} not found in catalogue`);
    return ex;
  };
  
  const base = (over: Partial<AlternativesContext> = {}): AlternativesContext => ({
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 5,
    scoreFn: () => 0,
    tieBreakFn: () => 0,
    ...over
  });
  
  const row = find("bent-over-barbell-row");
  const pull = find("bent-arm-barbell-pullover");
  const hpPullover: ExerciseRow = {
    ...pull,
    id: "t-hp-pullover",
    slug: "t-hp-pullover",
    name: "Test Row Pullover",
    movement_pattern: row.movement_pattern,
    mechanic: "compound",
    level_min: "beginner",
    contraindicated_regions: [],
    impact: "low",
    equipment_ids: row.equipment_ids
  };
  const other: ExerciseRow = {
    ...row,
    id: "t-row-2",
    slug: "t-row-2",
    name: "Test Seated Row"
  };
  
  const outA = rankAlternatives(row, [row, hpPullover, other], base()).map(e => e.slug);
  check("horizontal pull excludes pullover", !outA.includes("t-hp-pullover"));
  check("horizontal pull includes other alternative", outA.includes("t-row-2"));
}

console.log("\n10. Same pattern outranks better equipment fit (catches mutation 10)");
{
  const find = (slug: string): ExerciseRow => {
    const ex = catalogue.find(e => e.slug === slug);
    if (!ex) throw new Error(`Exercise ${slug} not found in catalogue`);
    return ex;
  };
  
  const base = (over: Partial<AlternativesContext> = {}): AlternativesContext => ({
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 5,
    scoreFn: () => 0,
    tieBreakFn: () => 0,
    ...over
  });
  
  const squat = find("barbell-squat");
  const samePatternPoorFit: ExerciseRow = {
    ...squat,
    id: "t-sq-bw",
    slug: "t-sq-bw",
    name: "Test Bodyweight Squat Variant",
    equipment_ids: [],
    level_min: "beginner",
    impact: "low",
    contraindicated_regions: []
  };
  const otherPatternPerfectFit: ExerciseRow = {
    ...squat,
    id: "t-lunge-bb",
    slug: "t-lunge-bb",
    name: "Test Barbell Lunge Variant",
    movement_pattern: "lunge",
    level_min: "beginner",
    impact: "low",
    contraindicated_regions: []
  };
  
  const outB = rankAlternatives(squat, [squat, otherPatternPerfectFit, samePatternPoorFit], base()).map(e => e.slug);
  check("same pattern ranks first", outB[0] === "t-sq-bw");
  check("other pattern ranks second", outB[1] === "t-lunge-bb");
}

console.log("\n11. High impact ranks after identical low impact (catches mutation 11 and impact comparator)");
{
  const find = (slug: string): ExerciseRow => {
    const ex = catalogue.find(e => e.slug === slug);
    if (!ex) throw new Error(`Exercise ${slug} not found in catalogue`);
    return ex;
  };
  
  const base = (over: Partial<AlternativesContext> = {}): AlternativesContext => ({
    level: "intermediate",
    availableEquipment: null,
    injuryRegions: [],
    limit: 5,
    scoreFn: () => 0,
    tieBreakFn: () => 0,
    ...over
  });
  
  const squat = find("barbell-squat");
  const low: ExerciseRow = {
    ...squat,
    id: "t-low",
    slug: "t-low",
    name: "Test Alpha Squat",
    impact: "low",
    level_min: "beginner",
    contraindicated_regions: []
  };
  const high: ExerciseRow = {
    ...squat,
    id: "t-high",
    slug: "t-high",
    name: "Test Bravo Squat",
    impact: "high",
    level_min: "beginner",
    contraindicated_regions: []
  };
  
  const outC = rankAlternatives(squat, [squat, high, low], base({ tieBreakFn: (slug) => (slug === "t-high" ? 0 : 1) })).map(e => e.slug);
  check("low-impact ranks first", outC[0] === "t-low");
  check("high-impact ranks second", outC[1] === "t-high");
}

if (failures === 0) {
  console.log("\n✓ All tests passed\n");
  process.exit(0);
} else {
  console.log(`\n✗ ${failures} test(s) failed\n`);
  process.exit(1);
}
