#!/usr/bin/env tsx
/**
 * Test that deload week check uses exact equality (week === deload_week).
 * 
 * Mutant killer (K): If the check uses > or < instead of ===, this test fails
 * because deload would trigger on the wrong weeks.
 */

import { readFileSync } from "fs";
import { join } from "path";

console.log("\n🧪 Testing deload week boundary checks\n");

const startSessionPath = join(process.cwd(), "src/lib/session/start-session.ts");
const todayPath = join(process.cwd(), "src/app/today/page.tsx");

const startSessionSource = readFileSync(startSessionPath, "utf-8");
const todaySource = readFileSync(todayPath, "utf-8");

// Check 1: start-session.ts uses === for deload week check
const startSessionPattern = /week\s*===\s*program\.deload_week|program\.deload_week\s*===\s*week/;
if (!startSessionPattern.test(startSessionSource)) {
  throw new Error("start-session.ts must use === (not >, <, >=, <=) for deload week check");
}
console.log("✓ start-session.ts uses === for deload week check");

// Check 2: today/page.tsx uses === for deload week check
const todayPattern = /week\s*===\s*program\.deload_week|program\.deload_week\s*===\s*week/;
if (!todayPattern.test(todaySource)) {
  throw new Error("today/page.tsx must use === (not >, <, >=, <=) for deload week check");
}
console.log("✓ today/page.tsx uses === for deload week check");

// Check 3: Ensure they don't use wrong operators
const wrongOps = /week\s*[><]=?\s*program\.deload_week|program\.deload_week\s*[><]=?\s*week/;
if (wrongOps.test(startSessionSource)) {
  throw new Error("start-session.ts must not use >, <, >=, or <= for deload week check");
}
console.log("✓ start-session.ts doesn't use wrong operators for deload check");

if (wrongOps.test(todaySource)) {
  throw new Error("today/page.tsx must not use >, <, >=, or <= for deload week check");
}
console.log("✓ today/page.tsx doesn't use wrong operators for deload check");

console.log("\n✅ All deload week boundary check tests passed\n");
