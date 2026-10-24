/**
 * M-3 contraindications test with PGlite. Validates migration 20261025000026.
 * npm run test:m3-wrist
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { generateProgram, type CandidateExercise, type GeneratorInput } from "@/lib/program/generate";
import { rankAlternatives, type AlternativesContext } from "@/lib/program/alternatives";
import { hashString } from "@/lib/program/generate";
import catalogueFixture from "./fixtures/catalogue.json";

type BodyRegion = "shoulder" | "elbow" | "wrist" | "lower_back" | "hip" | "knee" | "ankle" | "neck" | "upper_back";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
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
  const affected = catalogueFixture.filter((e: {slug: string}) => affectedSlugs.includes(e.slug));
  check("Found affected in fixture", affected.length > 0, `${affected.length}/${affectedSlugs.length}`);
  
  // Insert with tags MINUS what migration adds (baseline)
  for (const ex of affected) {
    const e = ex as {slug: string; name: string; contraindicated_regions: string[]; spinal_load: string};
    const baseline = e.contraindicated_regions.filter((r: string) =>
      !(RISKY_WRIST.includes(e.slug) && r === 'wrist') &&
      !(RISKY_LOWER_BACK.includes(e.slug) && r === 'lower_back')
    );
    const arr = baseline.length > 0 ? `ARRAY[${baseline.map(r => `'${r}'`).join(',')}]::body_region[]` : `'{}'::body_region[]`;
    await db.exec(`INSERT INTO exercises (slug, name, contraindicated_regions, spinal_load)
      VALUES ('${e.slug}', '${e.name.replace(/'/g, "''")}', ${arr}, '${e.spinal_load}');`);
  }
  
  console.log("\n2. Apply migration");
  const migPath = join(process.cwd(), "supabase/migrations/20261025000026_m3_wrist_lowerback_contraindications.sql");
  await db.exec(readFileSync(migPath, "utf-8"));
  check("Migration applied", true);
  
  console.log("\n3. Verify tags and idempotency");
  const wristMissing = await db.query(`SELECT slug FROM exercises WHERE slug = ANY(ARRAY[${RISKY_WRIST.map(s => `'${s}'`).join(',')}]) AND NOT ('wrist' = ANY(contraindicated_regions))`);
  const lbMissing = await db.query(`SELECT slug FROM exercises WHERE slug = ANY(ARRAY[${RISKY_LOWER_BACK.map(s => `'${s}'`).join(',')}]) AND NOT ('lower_back' = ANY(contraindicated_regions))`);
  check("All wrist exercises tagged", wristMissing.rows.length === 0);
  check("All lower_back exercises tagged", lbMissing.rows.length === 0);
  
  await db.exec(readFileSync(migPath, "utf-8"));
  check("Idempotent (2nd run succeeds)", true);
  
  console.log("\n4. Parse tags and build catalogue");
  const allRows = await db.query("SELECT slug, contraindicated_regions FROM exercises");
  const dbTags = new Map<string, string[]>();
  for (const row of allRows.rows) {
    const r = row as DbRow;
    const tags = parseTextArray(r.contraindicated_regions);
    check(`Tags for ${r.slug} is array`, Array.isArray(tags));
    dbTags.set(r.slug, tags);
  }
  
  const updated: CandidateExercise[] = catalogueFixture.map((ex: unknown) => {
    const e = ex as {slug: string; contraindicated_regions: string[]};
    return {...e, contraindicated_regions: (dbTags.get(e.slug) || e.contraindicated_regions) as BodyRegion[]};
  }) as CandidateExercise[];
  
  console.log("\n5. Test us-a plan (wrist+lower_back)");
  const usaInput: GeneratorInput = {
    userId: "usa", blockNumber: 1, goal: "fat_loss", level: "expert", primaryTrack: "bodyweight",
    daysPerWeek: 6, yogaDaysPerWeek: 1, age: 30, bmi: 22, hasAllEquipment: false,
    equipmentIds: ["bodyweight", "yoga_mat", "dip_bars", "dumbbell", "resistance_band"],
    currentInjuryRegions: ["wrist", "lower_back"], preferredSessionMinutes: 30, catalogue: updated,
  };
  const usaPlan = generateProgram(usaInput);
  const usaIds = usaPlan.days.flatMap(d => d.exercises.map(ex => ex.exerciseId));
  
  let wristViol = 0, lbViol = 0;
  for (const id of usaIds) {
    const ex = updated.find(e => e.id === id);
    if (ex) {
      if (RISKY_WRIST.includes(ex.slug)) wristViol++;
      if (RISKY_LOWER_BACK.includes(ex.slug)) lbViol++;
    }
  }
  check("us-a plan 0 wrist violations", wristViol === 0, wristViol > 0 ? `Found ${wristViol}` : "");
  check("us-a plan 0 lower_back violations", lbViol === 0, lbViol > 0 ? `Found ${lbViol}` : "");
  check("us-a no empty days", usaPlan.days.filter(d => d.dayType !== "rest" && d.dayType !== "yoga" && d.exercises.length === 0).length === 0);
  
  console.log("\n6. Test us-a swaps (10 exercises)");
  const usaSwapCtx: AlternativesContext = {
    level: "expert",
    availableEquipment: new Set(["bodyweight", "yoga_mat", "dip_bars", "dumbbell", "resistance_band"]),
    injuryRegions: ["wrist", "lower_back"],
    scoreFn: () => 1,
    tieBreakFn: (s: string) => hashString(s),
  };
  let usaSwapWrist = 0, usaSwapLb = 0;
  for (const id of usaIds.slice(0, 10)) {
    const ex = updated.find(e => e.id === id);
    if (ex) {
      const swaps = rankAlternatives(ex, updated, usaSwapCtx);
      for (const sw of swaps) {
        if (RISKY_WRIST.includes(sw.slug)) usaSwapWrist++;
        if (RISKY_LOWER_BACK.includes(sw.slug)) usaSwapLb++;
      }
    }
  }
  check("us-a swaps 0 wrist violations", usaSwapWrist === 0);
  check("us-a swaps 0 lower_back violations", usaSwapLb === 0);
  
  console.log("\n7. Test weights plan+swaps (wrist)");
  const weightsInput: GeneratorInput = {
    userId: "weights", blockNumber: 1, goal: "muscle_gain", level: "intermediate", primaryTrack: "weights",
    daysPerWeek: 4, yogaDaysPerWeek: 0, age: 25, bmi: 24, hasAllEquipment: true, equipmentIds: [],
    currentInjuryRegions: ["wrist"], preferredSessionMinutes: 60, catalogue: updated,
  };
  const weightsPlan = generateProgram(weightsInput);
  const weightsIds = weightsPlan.days.flatMap(d => d.exercises.map(ex => ex.exerciseId));
  let weightsViol = 0;
  for (const id of weightsIds) {
    const ex = updated.find(e => e.id === id);
    if (ex && RISKY_WRIST.includes(ex.slug)) weightsViol++;
  }
  check("weights plan 0 wrist violations", weightsViol === 0);
  
  const weightsSwapCtx: AlternativesContext = {
    level: "intermediate", availableEquipment: null, injuryRegions: ["wrist"],
    scoreFn: () => 1, tieBreakFn: (s: string) => hashString(s),
  };
  let weightsSwapViol = 0;
  for (const id of weightsIds.slice(0, 10)) {
    const ex = updated.find(e => e.id === id);
    if (ex) {
      const swaps = rankAlternatives(ex, updated, weightsSwapCtx);
      for (const sw of swaps) {
        if (RISKY_WRIST.includes(sw.slug)) weightsSwapViol++;
      }
    }
  }
  check("weights swaps 0 wrist violations", weightsSwapViol === 0);
  
  console.log("\n8. Fixture matches migration");
  let fixtureMismatch = 0;
  for (const ex of catalogueFixture) {
    const e = ex as {slug: string; contraindicated_regions: string[]};
    const dbTag = dbTags.get(e.slug);
    if (dbTag) {
      const fSet = new Set(e.contraindicated_regions);
      const dSet = new Set(dbTag);
      if (fSet.size !== dSet.size || [...fSet].some(t => !dSet.has(t))) fixtureMismatch++;
    }
  }
  check("Fixture matches migration", fixtureMismatch === 0);
  
  console.log("\n9. No-injury baseline");
  const baselinePath = join(process.cwd(), "scripts/fixtures/m3-baseline-no-injury.json");
  if (existsSync(baselinePath)) {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf-8')) as {exerciseSlugs: string[]};
    const noInjInput: GeneratorInput = {
      userId: "noinj", blockNumber: 1, goal: "strength", level: "intermediate", primaryTrack: "bodyweight",
      daysPerWeek: 4, yogaDaysPerWeek: 0, age: 30, bmi: 22, hasAllEquipment: false,
      equipmentIds: ["bodyweight", "yoga_mat", "dumbbell", "resistance_band"],
      currentInjuryRegions: [], preferredSessionMinutes: 45, catalogue: updated,
    };
    const noInjPlan = generateProgram(noInjInput);
    const noInjSlugs = noInjPlan.days.flatMap(d => d.exercises.map(ex => {
      const e = updated.find(cat => cat.id === ex.exerciseId);
      return e ? e.slug : '';
    })).filter(s => s !== '');
    
    if (baseline.exerciseSlugs.length > 0) {
      const bSet = new Set(baseline.exerciseSlugs);
      const nSet = new Set(noInjSlugs);
      const missing = [...bSet].filter(s => !nSet.has(s));
      const extra = [...nSet].filter(s => !bSet.has(s));
      check("No-injury matches baseline", missing.length === 0 && extra.length === 0,
        missing.length + extra.length > 0 ? `${missing.length} missing, ${extra.length} extra` : "");
    } else {
      console.log("  (baseline empty, skipping)");
    }
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
