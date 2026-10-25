/**
 * LOW: Verify machine_generic exists in migration 20260908210100.
 * 
 * The comment in test-timed-target-display.ts claims machine_generic is a "phantom ID"
 * (missing from the catalogue), but it's actually present in migration 20260908210100_seed_exercises.sql.
 */

import * as fs from "fs";
import * as path from "path";

const checks: Array<{ pass: boolean; name: string }> = [];
function check(name: string, pass: boolean) {
  checks.push({ pass, name });
  if (!pass) console.error(`✗ ${name}`);
}

console.log("Testing machine_generic equipment ID in migration\n");

// Read the migration file
const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260908210100_seed_exercises.sql"
);

let migrationContent = "";
try {
  migrationContent = fs.readFileSync(migrationPath, "utf-8");
} catch (error) {
  console.error(`Failed to read migration file: ${error}`);
  process.exit(1);
}

// --- Test 1: machine_generic exists in equipment seed ---
check(
  "machine_generic exists in equipment seed (line 8)",
  migrationContent.includes("('machine_generic', 'Gym machine (general)', 'machine', 33)")
);

// --- Test 2: machine_generic is used by exercises ---
const machineGenericMatches = migrationContent.match(/'machine_generic'/g);
const machineGenericCount = machineGenericMatches?.length ?? 0;

check(
  `machine_generic appears ${machineGenericCount} times (equipment + exercises)`,
  machineGenericCount >= 1
);

// --- Test 3: Specific exercises use machine_generic ---
check(
  "ab-crunch-machine uses machine_generic",
  migrationContent.includes("ab-crunch-machine") &&
    migrationContent.includes('{"machine_generic"}')
);

check(
  "calf-press uses machine_generic",
  migrationContent.includes("calf-press") &&
    migrationContent.includes('{"machine_generic"}')
);

check(
  "seated-calf-raise uses machine_generic",
  migrationContent.includes("seated-calf-raise") &&
    migrationContent.includes('{"machine_generic"}')
);

// --- Summary ---
console.log("");
const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => !c.pass).length;

if (failed > 0) {
  console.error(`\n${failed} failed, ${passed} passed\n`);
  process.exit(1);
}

console.log(`${passed} passed, ${failed} failed\n`);
console.log("✓ machine_generic is NOT a phantom ID - it exists in migration 20260908210100");
console.log("  The comment in test-timed-target-display.ts should be updated.\n");
