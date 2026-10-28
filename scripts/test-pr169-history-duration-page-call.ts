#!/usr/bin/env tsx
/**
 * Test PR #169 follow-up item 6: History detail page duration call site uses formatDurationMinutes.
 * 
 * Page-level test that verifies history/[id]/page.tsx uses the shared
 * formatDurationMinutes function instead of inline '0m' formatting.
 * 
 *   npx tsx scripts/test-pr169-history-duration-page-call.ts
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
  console.log("\nPR #169 follow-up item 6: History page duration uses formatDurationMinutes\n");

  const pagePath = join(process.cwd(), "src/app/history/[id]/page.tsx");
  const content = readFileSync(pagePath, "utf-8");

  console.log("Case 1: formatDurationMinutes is imported");
  {
    const hasImport = content.includes("import") && 
                       content.includes("formatDurationMinutes") &&
                       content.includes("from") &&
                       content.includes("compute-duration");
    assertEquals(hasImport, true, "formatDurationMinutes is imported from compute-duration");
  }

  console.log("\nCase 2: durationText is computed using formatDurationMinutes");
  {
    const hasDurationText = content.includes("const durationText = formatDurationMinutes(");
    assertEquals(hasDurationText, true, "durationText uses formatDurationMinutes");
  }

  console.log("\nCase 3: No inline '0m' or minutes formatting");
  {
    // Make sure there's no Math.round(durationSeconds / 60) pattern
    const hasInlineMinutes = content.match(/Math\.round\(durationSeconds \/ 60\)/);
    assertEquals(hasInlineMinutes, null, "no inline Math.round(durationSeconds / 60) pattern");
  }

  console.log("\nCase 4: Stat uses durationText not minutes");
  {
    const statUsesDurationText = content.includes('<Stat label="Time" value={durationText');
    assertEquals(statUsesDurationText, true, "Stat component uses durationText");
  }

  console.log("\nCase 5: No ${minutes}m pattern in Stat value");
  {
    const hasOldPattern = content.match(/<Stat label="Time" value=\{minutes.*\?.*`\$\{minutes\}m`/);
    assertEquals(hasOldPattern, null, "no old ${minutes}m pattern in Stat");
  }

  console.log(`\n✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    process.exit(1);
  }
  console.log("\n✨ All history duration page call tests passed!");
})();
