#!/usr/bin/env tsx
/**
 * A1 source-assertion test: verify startSession calls ensureSessionExercises.
 * 
 * This is a READ-ONLY test that asserts the call exists in the source.
 * Does not edit lines 104-260 of actions.ts.
 * 
 * Mutant A1 (removing the ensureSessionExercises call) must FAIL this test.
 */

import { readFileSync } from "fs";
import { join } from "path";

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ✓ ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ✗ FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
    process.exit(1);
  }
}

async function main() {
  console.log("A1 source-assertion: startSession calls ensureSessionExercises\n");

  // Read actions.ts source
  const actionsPath = join(process.cwd(), "src/app/session/actions.ts");
  const source = readFileSync(actionsPath, "utf8");

  // Find the startSession function (around line 104-260)
  // Extract the function body between "export async function startSession()" and the next "export"
  const startIdx = source.indexOf("export async function startSession()");
  const nextExportIdx = source.indexOf("export ", startIdx + 100);
  
  check("startSession function found", startIdx > 0);

  if (startIdx < 0) {
    console.error("Could not find startSession function");
    process.exit(1);
  }

  const startSessionBody = source.substring(startIdx, nextExportIdx > 0 ? nextExportIdx : startIdx + 8000);

  // A1: Assert the ensureSessionExercises call exists in the existing-session branch
  // The call should be: await ensureSessionExercises(supabase, user.id, existing.id)
  const ensureCallPattern = /ensureSessionExercises\s*\(\s*supabase\s*,\s*user\.id\s*,\s*existing\.id\s*\)/;
  const hasEnsureCall = ensureCallPattern.test(startSessionBody);

  check(
    "A1: startSession calls ensureSessionExercises(supabase, user.id, existing.id)",
    hasEnsureCall,
    hasEnsureCall ? "call found" : "call NOT found - mutant A1 would pass!",
  );

  console.log("\n✅ A1 source-assertion passed");
  console.log("\nMutant A1 (delete ensureSessionExercises call at actions.ts:151)");
  console.log("would FAIL this test: the regex would not match\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
