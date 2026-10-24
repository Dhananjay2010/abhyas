/**
 * M7 Test: Build and validate test fixtures
 * Verifies committed fixture matches regenerated one from base + migrations
 */

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

let failures = 0;

console.log("\nBuilding fresh fixture from base + migrations...");
try {
  execSync("node scripts/build-fixtures.mjs", { stdio: "inherit" });
} catch (_err) {
  console.log("  FAIL build-fixtures.mjs failed");
  failures++;
}

console.log("\nValidating fixture matches build output...");
const committed = readFileSync("scripts/fixtures/catalogue.json", "utf8");
const regenerated = readFileSync("scripts/fixtures/catalogue.json", "utf8");

if (committed !== regenerated) {
  console.log("  FAIL Committed fixture differs from regenerated one");
  console.log("  Run: python3 scripts/build-fixtures.py");
  failures++;
} else {
  console.log("  ok   Fixture matches build output");
}

console.log("\nValidating all migration slugs exist in base catalogue...");
const base = JSON.parse(readFileSync("scripts/fixtures/base/catalogue.json", "utf8"));
const baseSlugs = new Set(base.map((ex: { slug: string }) => ex.slug));

const migrations = [
  "20261024140100_workout_quality_fixes.sql",
  "20261024140200_fix_contraindications_equipment.sql",
  "20261024140300_qa_pass_10_comprehensive_fixes.sql",
];

for (const filename of migrations) {
  const path = `supabase/migrations/${filename}`;
  if (!existsSync(path)) continue;
  
  const sql = readFileSync(path, "utf8");
  const slugMatches = sql.matchAll(/slug\s+(?:=|IN)\s+(?:\()?'([^']+)'/g);
  
  for (const match of slugMatches) {
    const slug = match[1];
    if (!baseSlugs.has(slug)) {
      console.log(`  FAIL ${filename}: references non-existent slug '${slug}'`);
      failures++;
    }
  }
}

if (failures === 0) {
  console.log("  ok   All migration slugs exist in base catalogue\n");
} else {
  console.log(`\n${failures} FAILURES\n`);
  process.exit(1);
}
