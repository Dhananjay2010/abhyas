#!/usr/bin/env tsx
/**
 * Test PR #169 follow-up item 4: History detail page Volume call site excludes warm-ups.
 * 
 * Page-level test that verifies the actual history/[id]/page.tsx call site
 * filters warm-up sets from volume calculation.
 * 
 *   npx tsx scripts/test-pr169-history-volume-page-call.ts
 */

import { readFileSync } from "fs";
import { join } from "path";

let passed = 0;
let failed = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    console.log(`  ok   ${message}`);
    passed++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

(function main() {
  console.log("\nPR #169 follow-up item 4: History page Volume call site filters warm-ups\n");

  const pagePath = join(process.cwd(), "src/app/history/[id]/page.tsx");
  const content = readFileSync(pagePath, "utf-8");

  console.log("Case 1: Volume computation includes warm-up filter");
  {
    const hasVolumeWithFilter = content.includes("const volume = (sets ?? [])") &&
                                 content.includes(".filter((s) => !s.is_warmup_set)") &&
                                 content.includes(".reduce(");
    assertEquals(hasVolumeWithFilter, true, "volume filters out warm-up sets before reduce");
  }

  console.log("\nCase 2: Volume call is after set fetching");
  {
    const volumeAfterSets = content.indexOf("const { data: sets }") < content.indexOf("const volume");
    assertEquals(volumeAfterSets, true, "volume is computed after sets are fetched");
  }

  console.log("\nCase 3: Volume uses the fetched sets variable");
  {
    const volumeUsesSets = content.match(/const volume = \(sets \?\? \[\]\)/);
    assertEquals(volumeUsesSets !== null, true, "volume computation uses sets variable");
  }

  console.log("\nCase 4: No duplicate volume computation without filter");
  {
    // Check there's no other volume computation that doesn't filter
    const volumeLines = content.split("\n").filter(line => line.includes("const volume"));
    assertEquals(volumeLines.length, 1, "only one volume computation exists");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\n✨ All history volume page call tests passed!");
})();
