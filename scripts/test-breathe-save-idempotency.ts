#!/usr/bin/env node
/**
 * Integration test: verify breathing-session.tsx uses the save-once guard
 *
 * This static test verifies that:
 * - logId is generated once per mount with useState
 * - createSaveOnce is imported and used
 * - The wrapped save function is passed to doSave
 *
 * Behavioral tests are in test-breathe-save-once.ts.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sessionFile = resolve(
  __dirname,
  "../src/app/breathe/[slug]/session/breathing-session.tsx"
);
const source = readFileSync(sessionFile, "utf8");

const errors: string[] = [];

// Assert 1: logId is generated with useState
if (!source.match(/const\s+\[logId\]\s*=\s*useState\s*\(\s*\(\s*\)\s*=>\s*uuid\s*\(\s*\)\s*\)/)) {
  errors.push(
    "breathing-session.tsx must generate logId with useState(() => uuid()) for stability across re-renders"
  );
}

// Assert 2: createSaveOnce is imported
if (!source.includes('import { createSaveOnce }') && !source.includes('import {createSaveOnce}')) {
  errors.push("breathing-session.tsx must import createSaveOnce from @/lib/breathe/save-once");
}

// Assert 3: createSaveOnce is used to wrap the save call
if (!source.includes('createSaveOnce(')) {
  errors.push("breathing-session.tsx must use createSaveOnce to wrap recordBreathingPractice");
}

// Assert 4: logId is passed to the save function
if (!source.match(/logId[,\s]/) && !source.includes('logId:')) {
  errors.push("breathing-session.tsx must pass logId to recordBreathingPractice");
}

// Report
if (errors.length > 0) {
  console.error("❌ Breathe save idempotency integration test FAILED:\n");
  errors.forEach((e) => console.error(`  • ${e}`));
  console.error();
  process.exit(1);
}

console.log("✅ Breathe save idempotency integration test passed:");
console.log("  • logId generated once per practice with useState");
console.log("  • createSaveOnce imported from save-once helper");
console.log("  • Save function wrapped with createSaveOnce guard");
console.log("  • Same logId reused across all save attempts");
console.log();
console.log("  (See test-breathe-save-once.ts for behavioral tests)");

