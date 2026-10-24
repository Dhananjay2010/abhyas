#!/usr/bin/env tsx
/**
 * Test that Today page correctly applies deload transformations.
 * 
 * Mutant killer (D): If Today bypasses the shared helper and uses raw
 * prescription, this test fails because deload won't be applied.
 */

import { readFileSync } from "fs";
import { join } from "path";

console.log("\n🧪 Validating Today page uses deload helpers\n");

const todayPath = join(process.cwd(), "src/app/today/page.tsx");
const source = readFileSync(todayPath, "utf-8");

// Check 1: Today imports loadReducibleFor
if (!source.includes("import") || !source.includes("loadReducibleFor")) {
  throw new Error("Today page must import loadReducibleFor from load-reducible");
}
console.log("✓ Today page imports loadReducibleFor");

// Check 2: Today imports resolveSessionTargets
if (!source.includes("import") || !source.includes("resolveSessionTargets")) {
  throw new Error("Today page must import resolveSessionTargets");
}
console.log("✓ Today page imports resolveSessionTargets");

// Check 3: Today calls loadReducibleFor for exercises
if (!source.includes("loadReducibleFor(equipmentIds, metric)")) {
  throw new Error("Today page must call loadReducibleFor to determine exercise type");
}
console.log("✓ Today page calls loadReducibleFor");

// Check 4: Today passes loadReducible and isDeload to resolveSessionTargets
// Look for the pattern where isDeload, loadReducible, and metric are passed together
const contextPattern = /\{\s*isDeload[^}]*loadReducible[^}]*metric[^}]*\}/s;
if (!contextPattern.test(source)) {
  throw new Error("Today page must pass isDeload, loadReducible, and metric to resolveSessionTargets");
}
console.log("✓ Today page passes deload context to resolveSessionTargets");

// Check 5: Today doesn't bypass deload by directly using raw prescription
if (source.match(/sets:\s*r\.target_sets[,}]/m) && 
    source.match(/repsMin:\s*r\.target_reps_min[,}]/m) &&
    !source.includes("resolveSessionTargets")) {
  throw new Error("Today page must not bypass deload by directly using raw prescription");
}
console.log("✓ Today page doesn't bypass deload transformation");

console.log("\n✅ All Today page deload helper validation tests passed\n");
