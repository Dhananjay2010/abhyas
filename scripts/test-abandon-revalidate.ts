#!/usr/bin/env tsx
/**
 * Test LOW: abandonSession calls revalidateTrainingData after success.
 *
 *   npx tsx scripts/test-abandon-revalidate.ts
 */

import { readFileSync } from "fs";
import { join } from "path";

let passed = 0;
let failed = 0;

function assertTrue(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    failed++;
  }
}

console.log("\nTesting abandonSession revalidates after success\n");

// Test: Check that abandonSession calls revalidateTrainingData
console.log("1. abandonSession source calls revalidateTrainingData");
{
  const actionsPath = join(process.cwd(), "src/app/session/actions.ts");
  const actionsSource = readFileSync(actionsPath, "utf-8");

  const abandonFunctionMatch = actionsSource.match(
    /export async function abandonSession\([^)]*\)[^{]*\{[\s\S]*?^\}/m
  );

  if (!abandonFunctionMatch) {
    console.error("❌ Could not find abandonSession function");
    failed++;
  } else {
    const abandonBody = abandonFunctionMatch[0];
    
    const hasRevalidateCall = abandonBody.includes("revalidateTrainingData");
    assertTrue(hasRevalidateCall, "abandonSession calls revalidateTrainingData");
    
    if (hasRevalidateCall) {
      const revalidateIndex = abandonBody.indexOf("revalidateTrainingData");
      const resultIndex = abandonBody.indexOf("const result = await abandonSessionCore");
      const returnIndex = abandonBody.indexOf("return result");
      
      const revalidateAfterCore = revalidateIndex > resultIndex;
      assertTrue(
        revalidateAfterCore,
        "revalidateTrainingData called after abandonSessionCore"
      );
      
      const revalidateBeforeReturn = revalidateIndex < returnIndex;
      assertTrue(
        revalidateBeforeReturn,
        "revalidateTrainingData called before return"
      );
    }
  }
}

console.log(`\n✅ Passed: ${passed}`);
if (failed > 0) {
  console.log(`❌ Failed: ${failed}`);
  process.exit(1);
}

console.log("\n✨ All abandon-revalidate tests passed!");
