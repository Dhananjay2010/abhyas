/**
 * M-3 contraindications test with PGlite. Validates migration 20261025000028.
 * npm run test:m3-wrist
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";
import { join } from "path";
import { generateProgram, type CandidateExercise, type GeneratorInput, hashString } from "@/lib/program/generate";
import { rankAlternatives, type AlternativesContext } from "@/lib/program/alternatives";
import catalogueFixture from "./fixtures/catalogue.json";
import { M3_NO_INJURY_PROFILES, M3_GRID_SETUPS, countEmptySwapLists, isCandidateExercise, realSwaps, snapshotPlan } from "./m3-real-path";
import type { Database } from "@/lib/database.types";

type BodyRegion = Database["public"]["Enums"]["body_region"];

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

// Type guards
function isExerciseRecord(e: unknown): e is {slug: string; name: string; contraindicated_regions: string[]; spinal_load: string} {
  return typeof e === 'object' && e !== null &&
    'slug' in e && typeof e.slug === 'string' &&
    'name' in e && typeof e.name === 'string' &&
    'contraindicated_regions' in e && Array.isArray(e.contraindicated_regions) &&
    'spinal_load' in e && typeof e.spinal_load === 'string';
}

function isSlugRecord(e: unknown): e is {slug: string} {
  return typeof e === 'object' && e !== null &&
    'slug' in e && typeof e.slug === 'string';
}

function isTagRecord(e: unknown): e is {slug: string; contraindicated_regions: string[]} {
  return typeof e === 'object' && e !== null &&
    'slug' in e && typeof e.slug === 'string' &&
    'contraindicated_regions' in e && Array.isArray(e.contraindicated_regions);
}

// HARD-CODED risky lists (independent of DB tags)
const RISKY_WRIST = [
  'pike-push-up', 'elevated-pike-push-up', 'dips-triceps-version', 'bench-dips', 'dip-machine',
  'front-barbell-squat', 'front-barbell-squat-to-a-bench',
  'spider-crawl', 'alternating-renegade-row', 'squat-jerk',
  'double-kettlebell-jerk', 'one-arm-kettlebell-jerk', 'one-arm-kettlebell-split-jerk',
  'two-arm-kettlebell-jerk', 'kettlebell-thruster',
  'kettlebell-turkish-get-up-lunge-style', 'kettlebell-turkish-get-up-squat-style'
];

const RISKY_LOWER_BACK = [
  'one-arm-long-bar-row', 't-bar-row-with-handle', 'barbell-rear-delt-row',
  'alternating-kettlebell-row', 'two-arm-kettlebell-row', 'one-arm-kettlebell-row',
  'kettlebell-windmill', 'advanced-kettlebell-windmill', 'double-kettlebell-windmill',
  'one-arm-kettlebell-swings', 'vertical-swing',
  'russian-twist', 'seated-barbell-twist', 'cable-russian-twists', 'standing-cable-wood-chop'
];

// Parse PGlite text[] (e.g. "{shoulder,wrist}") into string[]
function parseTextArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(v => String(v));
  if (typeof value === 'string') {
    const s = value.trim();
    if (s === '{}') return [];
    if (s.startsWith('{') && s.endsWith('}')) {
      return s.slice(1, -1).split(',').map(t => t.trim()).filter(t => t !== '');
    }
    return [s];
  }
  return [];
}

interface DbRow { slug: string; contraindicated_regions: unknown; }
function isDbRow(r: unknown): r is DbRow {
  return typeof r === "object" && r !== null && "slug" in r && typeof r.slug === "string" && "contraindicated_regions" in r;
}
const BODY_REGIONS: BodyRegion[] = ["shoulder", "elbow", "wrist", "lower_back", "hip", "knee", "ankle", "neck", "upper_back"];
function isBodyRegion(r: string): r is BodyRegion {
  return BODY_REGIONS.some((b) => b === r);
}

async function runTest() {
  console.log("\nInitializing PGlite...");
  const db = new PGlite();
  
  await db.exec(`
    CREATE TYPE body_region AS ENUM ('shoulder','elbow','wrist','lower_back','hip','knee','ankle','neck','upper_back');
    CREATE TYPE spinal_load_level AS ENUM ('none','low','moderate','high');
    CREATE TABLE exercises (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contraindicated_regions body_region[] DEFAULT '{}',
      spinal_load spinal_load_level DEFAULT 'none'
    );
  `);
  
  console.log("\n1. Insert affected exercises (pre-migration)");
  const affectedSlugs = [...new Set([...RISKY_WRIST, ...RISKY_LOWER_BACK])];
  const affected = catalogueFixture.filter((e: unknown) => isSlugRecord(e) && affectedSlugs.includes(e.slug));
  check("Found affected in fixture", affected.length === affectedSlugs.length, `${affected.length}/${affectedSlugs.length}`);
  
  // Insert with tags MINUS what migration adds (baseline)
  for (const ex of affected) {
    if (!isExerciseRecord(ex)) {
      const item: unknown = ex;
      const slug = (typeof item === 'object' && item !== null && 'slug' in item && typeof item.slug === 'string') ? item.slug : 'unknown';
      check(`Exercise record valid`, false, `slug ${slug} failed isExerciseRecord`);
      continue;
    }
    const baseline = ex.contraindicated_regions.filter((r: string) =>
      !(RISKY_WRIST.includes(ex.slug) && r === 'wrist') &&
      !(RISKY_LOWER_BACK.includes(ex.slug) && r === 'lower_back')
    );
    const arr = baseline.length > 0 ? `ARRAY[${baseline.map(r => `'${r}'`).join(',')}]::body_region[]` : `'{}'::body_region[]`;
    await db.exec(`INSERT INTO exercises (slug, name, contraindicated_regions, spinal_load)
      VALUES ('${ex.slug}', '${ex.name.replace(/'/g, "''")}', ${arr}, '${ex.spinal_load}');`);
  }
  
  console.log("\n2. Apply migration");
  const migPath = join(process.cwd(), "supabase/migrations/20261025000028_m3_wrist_lowerback_contraindications.sql");
  await db.exec(readFileSync(migPath, "utf-8"));
  
  console.log("\n3. Test RAISE EXCEPTION path");
  // Test by inserting only a subset of exercises, then running migration
  // The verification block should raise because missing exercises aren't in the table
  const miniDb = new PGlite();
  try {
    await miniDb.exec(`
      CREATE TYPE body_region AS ENUM ('shoulder','elbow','wrist','lower_back','hip','knee','ankle','neck','upper_back');
      CREATE TYPE spinal_load_level AS ENUM ('none','low','moderate','high');
      CREATE TABLE exercises (slug TEXT PRIMARY KEY, name TEXT NOT NULL, contraindicated_regions body_region[] DEFAULT '{}', spinal_load spinal_load_level DEFAULT 'none');
      INSERT INTO exercises (slug, name) VALUES ('pike-push-up', 'Pike Push-Up');
    `);
    // Now run migration - it should fail because most target exercises are missing
    await miniDb.exec(readFileSync(migPath, "utf-8"));
    check("RAISE EXCEPTION on missing slug", false, "Should have raised but didn't");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check("RAISE EXCEPTION on missing slug", msg.includes("Missing exercises"), msg.slice(0, 100));
  } finally {
    await miniDb.close();
  }
  
  console.log("\n4. Verify tags and idempotency");
  const wristMissing = await db.query(`SELECT slug FROM exercises WHERE slug = ANY(ARRAY[${RISKY_WRIST.map(s => `'${s}'`).join(',')}]) AND NOT ('wrist' = ANY(contraindicated_regions))`);
  const lbMissing = await db.query(`SELECT slug FROM exercises WHERE slug = ANY(ARRAY[${RISKY_LOWER_BACK.map(s => `'${s}'`).join(',')}]) AND NOT ('lower_back' = ANY(contraindicated_regions))`);
  check("All wrist exercises tagged", wristMissing.rows.length === 0);
  check("All lower_back exercises tagged", lbMissing.rows.length === 0);
  
  const snap = async () => JSON.stringify((await db.query("SELECT slug, contraindicated_regions::text AS r FROM exercises ORDER BY slug")).rows);
  const before = await snap();
  await db.exec(readFileSync(migPath, "utf-8"));
  check("Idempotent: 2nd run changes no row", (await snap()) === before);
  
  // Check no duplicates after 2nd run
  const dupes = await db.query(`
    SELECT slug, contraindicated_regions 
    FROM exercises 
    WHERE array_length(contraindicated_regions, 1) != 
          (SELECT COUNT(DISTINCT r) FROM unnest(contraindicated_regions) r)
  `);
  check("No duplicate tags after 2nd run", dupes.rows.length === 0,
    dupes.rows.length > 0 ? `${dupes.rows.length} exercises with dupes` : "");
  
  console.log("\n5. Parse tags and build catalogue");
  const allRows = await db.query("SELECT slug, contraindicated_regions FROM exercises");
  const dbTags = new Map<string, string[]>();
  let allValid = true;
  for (const row of allRows.rows) {
    if (!isDbRow(row)) { allValid = false; continue; }
    const tags = parseTextArray(row.contraindicated_regions);
    if (!Array.isArray(tags) || !tags.every(isBodyRegion)) allValid = false;
    dbTags.set(row.slug, tags);
  }
  check("All DB tags are valid body regions AND all affected slugs present", allValid && dbTags.size === affectedSlugs.length);
  
  const fixtureRows: unknown[] = catalogueFixture;
  const updated: CandidateExercise[] = fixtureRows
    .filter(isCandidateExercise)
    .map((ex) => {
      const dbRegions = dbTags.get(ex.slug);
      return { ...ex, contraindicated_regions: dbRegions ? dbRegions.filter(isBodyRegion) : ex.contraindicated_regions };
    });
  check("Catalogue keeps every fixture row (incl. mechanic: null)", updated.length === fixtureRows.length, `${updated.length}/${fixtureRows.length}`);

  console.log("\n6. Test us-a plan (wrist+lower_back)");
  const usaInput: GeneratorInput = {
    userId: "usa", blockNumber: 1, goal: "fat_loss", level: "expert", primaryTrack: "bodyweight",
    daysPerWeek: 6, yogaDaysPerWeek: 1, age: 30, bmi: 22, hasAllEquipment: false,
    equipmentIds: ["bodyweight", "yoga_mat", "dip_bars", "dumbbell", "resistance_band"],
    currentInjuryRegions: ["wrist", "lower_back"], preferredSessionMinutes: 30, catalogue: updated,
  };
  const usaPlan = generateProgram(usaInput);
  const usaIds = usaPlan.days.flatMap(d => d.exercises.map(ex => ex.exerciseId));
  
  let wristViol = 0, lbViol = 0, unknownIds = 0;
  for (const id of usaIds) {
    const ex = updated.find(e => e.id === id);
    if (ex) {
      if (RISKY_WRIST.includes(ex.slug)) wristViol++;
      if (RISKY_LOWER_BACK.includes(ex.slug)) lbViol++;
    } else {
      unknownIds++;
    }
  }
  check("us-a: all plan ids resolve to catalogue rows", unknownIds === 0, `${unknownIds} unknown`);
  check("us-a plan 0 wrist violations", wristViol === 0, wristViol > 0 ? `Found ${wristViol}` : "");
  check("us-a plan 0 lower_back violations", lbViol === 0, lbViol > 0 ? `Found ${lbViol}` : "");
  check("us-a no empty days", usaPlan.days.filter(d => d.dayType !== "rest" && d.dayType !== "yoga" && d.exercises.length === 0).length === 0);
  
  console.log("\n7. Test us-a swaps (ALL exercises)");
  const usaSwapCtx: AlternativesContext = {
    level: "expert",
    availableEquipment: new Set(["bodyweight", "yoga_mat", "dip_bars", "dumbbell", "resistance_band"]),
    injuryRegions: ["wrist", "lower_back"],
    scoreFn: () => 1,
    tieBreakFn: (s: string) => hashString(s),
  };
  let usaSwapWrist = 0, usaSwapLb = 0, usaSwapUnknown = 0;
  for (const id of usaIds) {
    const ex = updated.find(e => e.id === id);
    if (ex) {
      const swaps = rankAlternatives(ex, updated, usaSwapCtx);
      for (const sw of swaps) {
        if (RISKY_WRIST.includes(sw.slug)) usaSwapWrist++;
        if (RISKY_LOWER_BACK.includes(sw.slug)) usaSwapLb++;
      }
    } else {
      usaSwapUnknown++;
    }
  }
  check("us-a swaps: all plan ids resolve to catalogue rows", usaSwapUnknown === 0, `${usaSwapUnknown} unknown`);
  check("us-a swaps 0 wrist violations", usaSwapWrist === 0);
  check("us-a swaps 0 lower_back violations", usaSwapLb === 0);
  
  console.log("\n8. Test weights plan+swaps (wrist, ALL exercises)");
  const weightsInput: GeneratorInput = {
    userId: "weights", blockNumber: 1, goal: "muscle_gain", level: "intermediate", primaryTrack: "weights",
    daysPerWeek: 4, yogaDaysPerWeek: 0, age: 25, bmi: 24, hasAllEquipment: true, equipmentIds: [],
    currentInjuryRegions: ["wrist"], preferredSessionMinutes: 60, catalogue: updated,
  };
  const weightsPlan = generateProgram(weightsInput);
  const weightsIds = weightsPlan.days.flatMap(d => d.exercises.map(ex => ex.exerciseId));
  let weightsViol = 0, weightsPlanUnknown = 0;
  for (const id of weightsIds) {
    const ex = updated.find(e => e.id === id);
    if (ex) {
      if (RISKY_WRIST.includes(ex.slug)) weightsViol++;
    } else {
      weightsPlanUnknown++;
    }
  }
  check("weights plan: all ids resolve to catalogue rows", weightsPlanUnknown === 0, `${weightsPlanUnknown} unknown`);
  check("weights plan 0 wrist violations", weightsViol === 0);
  
  const weightsSwapCtx: AlternativesContext = {
    level: "intermediate", availableEquipment: null, injuryRegions: ["wrist"],
    scoreFn: () => 1, tieBreakFn: (s: string) => hashString(s),
  };
  let weightsSwapViol = 0, weightsSwapUnknown = 0;
  for (const id of weightsIds) {
    const ex = updated.find(e => e.id === id);
    if (ex) {
      const swaps = rankAlternatives(ex, updated, weightsSwapCtx);
      for (const sw of swaps) {
        if (RISKY_WRIST.includes(sw.slug)) weightsSwapViol++;
      }
    } else {
      weightsSwapUnknown++;
    }
  }
  check("weights swaps: all ids resolve to catalogue rows", weightsSwapUnknown === 0, `${weightsSwapUnknown} unknown`);
  check("weights swaps 0 wrist violations", weightsSwapViol === 0);
  
  console.log("\n9. Test weights plan+swaps (lower_back, ALL exercises)");
  const lbInput: GeneratorInput = {
    userId: "lb", blockNumber: 1, goal: "strength", level: "intermediate", primaryTrack: "weights",
    daysPerWeek: 4, yogaDaysPerWeek: 0, age: 30, bmi: 23, hasAllEquipment: true, equipmentIds: [],
    currentInjuryRegions: ["lower_back"], preferredSessionMinutes: 60, catalogue: updated,
  };
  const lbPlan = generateProgram(lbInput);
  const lbIds = lbPlan.days.flatMap(d => d.exercises.map(ex => ex.exerciseId));
  let lbOnlyViol = 0, lbPlanUnknown = 0;
  for (const id of lbIds) {
    const ex = updated.find(e => e.id === id);
    if (ex) {
      if (RISKY_LOWER_BACK.includes(ex.slug)) lbOnlyViol++;
    } else {
      lbPlanUnknown++;
    }
  }
  check("lb plan: all ids resolve to catalogue rows", lbPlanUnknown === 0, `${lbPlanUnknown} unknown`);
  check("lb plan 0 lower_back violations", lbOnlyViol === 0, lbOnlyViol > 0 ? `Found ${lbOnlyViol}` : "");
  // Kettlebell-only: on no-injury input this exact profile gets alternating-kettlebell-row and
  // one-arm-kettlebell-row, so a generator that ignores lower_back puts them back.
  const kbLbInput: GeneratorInput = {
    userId: "22222222-2222-2222-2222-222222222222", blockNumber: 1, goal: "fat_loss", level: "intermediate", primaryTrack: "weights",
    daysPerWeek: 3, yogaDaysPerWeek: 0, age: 35, bmi: 24, hasAllEquipment: false, equipmentIds: ["kettlebell"],
    currentInjuryRegions: ["lower_back"], preferredSessionMinutes: 60, catalogue: updated,
  };
  const kbNoInj = generateProgram({ ...kbLbInput, currentInjuryRegions: [] });
  const kbNoInjRisky = kbNoInj.days.flatMap((d) => d.exercises).filter((x) => RISKY_LOWER_BACK.includes(updated.find((e) => e.id === x.exerciseId)?.slug ?? "")).length;
  check("kb probe: no-injury plan does contain lower_back-risky rows (probe is live)", kbNoInjRisky > 0, `${kbNoInjRisky}`);
  const kbLbPlan = generateProgram(kbLbInput);
  let kbLbViol = 0, kbUnknown = 0;
  for (const [di, d] of kbLbPlan.days.entries()) {
    const inSession = new Set(d.exercises.map((x) => x.exerciseId));
    for (const [xi, x] of d.exercises.entries()) {
      const ex = updated.find((e) => e.id === x.exerciseId);
      if (!ex) {
        kbUnknown++;
        continue;
      }
      if (RISKY_LOWER_BACK.includes(ex.slug)) kbLbViol++;
      kbLbViol += realSwaps(updated, ex, kbLbInput, inSession, `kb:d${di}:s${xi}`).filter((sw) => RISKY_LOWER_BACK.includes(sw)).length;
    }
  }
  check("kb: all ids resolve to catalogue rows", kbUnknown === 0, `${kbUnknown} unknown`);
  check("kb lower_back plan+real swaps 0 lower_back violations", kbLbViol === 0, `${kbLbViol}`);
  
  const lbSwapCtx: AlternativesContext = {
    level: "intermediate", availableEquipment: null, injuryRegions: ["lower_back"],
    scoreFn: () => 1, tieBreakFn: (s: string) => hashString(s),
  };
  let lbOnlySwapViol = 0, lbSwapUnknown = 0;
  for (const id of lbIds) {
    const ex = updated.find(e => e.id === id);
    if (ex) {
      const swaps = rankAlternatives(ex, updated, lbSwapCtx);
      for (const sw of swaps) {
        if (RISKY_LOWER_BACK.includes(sw.slug)) lbOnlySwapViol++;
      }
    } else {
      lbSwapUnknown++;
    }
  }
  check("lb swaps: all ids resolve to catalogue rows", lbSwapUnknown === 0, `${lbSwapUnknown} unknown`);
  check("lb swaps 0 lower_back violations", lbOnlySwapViol === 0);
  
  // Derived lower_back rule: high spinal load exercises are excluded from lower_back injury plans/swaps
  const lbLevels: GeneratorInput["level"][] = ["beginner", "intermediate", "expert"];
  const bySlug = new Map(updated.map((e) => [e.slug, e]));
  let lbDerivedLeaks = 0;
  for (const s of M3_GRID_SETUPS) for (const level of lbLevels) for (const daysPerWeek of [3, 4]) {
    const plan = snapshotPlan({ userId: "22222222-2222-2222-2222-222222222222", blockNumber: 1, goal: "strength", level, ...s, daysPerWeek, yogaDaysPerWeek: 0, age: 35, bmi: 24, currentInjuryRegions: ["lower_back"], preferredSessionMinutes: 60 }, updated);
    for (const d of plan) for (const slot of d.slots) for (const w of [slot.slug, ...slot.swaps]) {
      const e = bySlug.get(w);
      if (!e || e.spinal_load === "high" || e.contraindicated_regions.includes("lower_back")) lbDerivedLeaks++;
    }
  }
  check("lower_back real path: plan + swaps never offer high spinal load or lower_back-tagged rows", lbDerivedLeaks === 0, `${lbDerivedLeaks}`);
  
  console.log("\n10. Swap filter test (no-injury plan + lb context, ALL exercises)");
  const noInjPlan = generateProgram({
    userId: "noinj-swap", blockNumber: 1, goal: "strength", level: "intermediate", primaryTrack: "weights",
    daysPerWeek: 4, yogaDaysPerWeek: 0, age: 30, bmi: 23, hasAllEquipment: true, equipmentIds: [],
    currentInjuryRegions: [], preferredSessionMinutes: 60, catalogue: updated,
  });
  const noInjIds = noInjPlan.days.flatMap(d => d.exercises.map(ex => ex.exerciseId));
  let swapFilterViol = 0, swapFilterUnknown = 0;
  for (const id of noInjIds) {
    const ex = updated.find(e => e.id === id);
    if (ex) {
      const swaps = rankAlternatives(ex, updated, lbSwapCtx);
      for (const sw of swaps) {
        if (RISKY_LOWER_BACK.includes(sw.slug)) swapFilterViol++;
      }
    } else {
      swapFilterUnknown++;
    }
  }
  check("swap filter: all ids resolve to catalogue rows", swapFilterUnknown === 0, `${swapFilterUnknown} unknown`);
  check("Swaps for no-injury plan exclude lower_back when filtered", swapFilterViol === 0,
    swapFilterViol > 0 ? `Found ${swapFilterViol} risky swaps` : "");
  
  console.log("\n11. Fixture matches migration");
  let fixtureMismatch = 0;
  for (const ex of catalogueFixture) {
    if (!isTagRecord(ex)) continue;
    const dbTag = dbTags.get(ex.slug);
    if (dbTag) {
      const fSet = new Set(ex.contraindicated_regions);
      const dSet = new Set(dbTag);
      if (fSet.size !== dSet.size || [...fSet].some(t => !dSet.has(t))) fixtureMismatch++;
    }
  }
  check("Fixture matches migration", fixtureMismatch === 0);
  
  console.log("\n12. Determinism check (two runs)");
  const det1 = generateProgram(usaInput);
  const det2 = generateProgram(usaInput);
  const det1Ids = det1.days.flatMap(d => d.exercises.map(ex => ex.exerciseId)).join(',');
  const det2Ids = det2.days.flatMap(d => d.exercises.map(ex => ex.exerciseId)).join(',');
  check("Two runs produce identical plans", det1Ids === det2Ids);
  
  console.log("\n13. No-injury baseline regression (plans + real swaps vs main)");
  const baselineParsed: unknown = JSON.parse(readFileSync(join(process.cwd(), "scripts/fixtures/m3-baseline-no-injury.json"), "utf-8"));
  const baselineProfiles = typeof baselineParsed === "object" && baselineParsed !== null && "profiles" in baselineParsed && Array.isArray(baselineParsed.profiles) ? baselineParsed.profiles : [];
  check("Baseline has every profile", baselineProfiles.length === M3_NO_INJURY_PROFILES.length, `${baselineProfiles.length}/${M3_NO_INJURY_PROFILES.length}`);
  let baselineDiffs = 0;
  for (const p of M3_NO_INJURY_PROFILES) {
    const want: unknown = baselineProfiles.find((b: unknown) => typeof b === "object" && b !== null && "userId" in b && b.userId === p.userId);
    const wantDays = typeof want === "object" && want !== null && "days" in want ? JSON.stringify(want.days) : "missing";
    const got = JSON.stringify(snapshotPlan(p, updated));
    if (got !== wantDays) { baselineDiffs++; console.log(`  diff: ${p.userId}`); }
  }
  check("No-injury plans + swaps identical to main", baselineDiffs === 0, `${baselineDiffs} profile(s) differ`);

  console.log("\n14. Empty swap lists (regression guard: fails only if a count goes UP)");
  // Pinned at cfbff5b1 on the 1,680-profile grid in scripts/m3-real-path.ts.
  // Main 714f169b (after #104 and #123 exclusions): none 2612, wrist 3712, lower_back 3377, both 4576.
  // M-3 wrist+lower_back deltas vs main: +0/+436/+657/+1188.
  const PINNED_EMPTY: Array<[string, BodyRegion[], number]> = [["none", [], 2612], ["wrist", ["wrist"], 3712], ["lower_back", ["lower_back"], 3377], ["wrist+lower_back", ["wrist", "lower_back"], 4576]];
  for (const [label, injuries, pinned] of PINNED_EMPTY) {
    const { slots, empty } = countEmptySwapLists(updated, injuries);
    check(`Empty swap lists (${label}) <= ${pinned}`, empty <= pinned, `${empty} of ${slots} slots${empty < pinned ? " (dropped: lower the pin)" : ""}`);
  }

  await db.close();
}

runTest().then(() => {
  console.log(`\n${"=".repeat(60)}`);
  if (failures === 0) {
    console.log("✓ All M3 tests passed");
    process.exit(0);
  } else {
    console.log(`✗ ${failures} test(s) failed`);
    process.exit(1);
  }
}).catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
