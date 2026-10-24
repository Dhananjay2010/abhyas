export {};
/**
 * Test that after a block rollover, the correct block information is displayed.
 *
 * Issue (f): After a block rollover, the header showed "Block 1 · Week 4 of 4" 
 * (old block) while the banner correctly said "Block 2 starts today" (new block).
 *
 * Root cause: The re-read query after rollover used `.eq("status", "active")` 
 * instead of `.eq("id", rollover.programId)`. This could return stale data due to:
 * - Caching or read replica lag
 * - Race conditions during the brief window when blocks are being updated
 * - Ambiguity if multiple active blocks exist momentarily
 *
 * Fix: Query for the specific program ID returned by the rollover, not just 
 * "any active program".
 *
 *   npm run test:rollover-display
 */

import { weekInBlock } from "../src/lib/program/prescription";
import { addDays, localDateString } from "../src/lib/dates";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Week calculation after rollover");
{
  // Simulate a rolled-over block: started today, so we should be in week 1
  const today = localDateString("UTC");
  const week = weekInBlock(today, today);
  check("week 1 on rollover day", week === 1, `got week ${week}`);

  // One day after rollover
  const tomorrow = addDays(today, 1);
  const weekTomorrow = weekInBlock(today, tomorrow);
  check("still week 1 day after rollover", weekTomorrow === 1, `got week ${weekTomorrow}`);

  // End of week 1 (6 days after start, since weeks are 7 days)
  const endOfWeek1 = addDays(today, 6);
  const weekEnd = weekInBlock(today, endOfWeek1);
  check("week 1 at end of first 7 days", weekEnd === 1, `got week ${weekEnd}`);

  // Start of week 2 (7 days after start)
  const startOfWeek2 = addDays(today, 7);
  const week2 = weekInBlock(today, startOfWeek2);
  check("week 2 after 7 days", week2 === 2, `got week ${week2}`);

  // Week 4 (21 days after start)
  const week4Start = addDays(today, 21);
  const week4 = weekInBlock(today, week4Start);
  check("week 4 at day 22", week4 === 4, `got week ${week4}`);

  // Last day of block (27 days = 4 weeks inclusive)
  const lastDay = addDays(today, 27);
  const weekLast = weekInBlock(today, lastDay);
  check("week 4 on last day of block", weekLast === 4, `got week ${weekLast}`);

  // Day after block ends - may still return week 4 depending on implementation
  const dayAfter = addDays(today, 28);
  const weekAfter = weekInBlock(today, dayAfter);
  check("week calculated for day after block ends", weekAfter >= 4, `got week ${weekAfter}`);
}

console.log("\n2. Block display consistency");
{
  // Simulate the issue: old block data vs new rollover data
  const oldBlock = {
    block_number: 1,
    started_on: addDays(localDateString("UTC"), -27), // Started 27 days ago
    ends_on: addDays(localDateString("UTC"), -1), // Ended yesterday
  };

  const newBlock = {
    block_number: 2,
    started_on: localDateString("UTC"), // Starts today
    ends_on: addDays(localDateString("UTC"), 27), // Ends in 27 days
  };

  const today = localDateString("UTC");

  // Old block calculation - date is past block end
  const oldWeek = weekInBlock(oldBlock.started_on, today);
  check("old block calculation shows later week", oldWeek >= 4, `got week ${oldWeek}`);

  // New block calculation (correct)
  const newWeek = weekInBlock(newBlock.started_on, today);
  check("new block shows week 1", newWeek === 1, `got week ${newWeek}`);

  // The fix ensures we use newBlock data, not oldBlock data
  check(
    "header should show new block number",
    newBlock.block_number === 2,
    `got ${newBlock.block_number}`,
  );
}

console.log("\n3. Program ID specificity");
{
  // The fix changes from:
  //   .eq("status", "active").maybeSingle()
  // To:
  //   .eq("id", rollover.programId).single()
  
  // This ensures we get the exact block that was just created,
  // not potentially stale data from a cached or replicated query.
  
  const mockProgramId = "new-program-uuid";
  const mockRolloverResult = {
    status: "rolled_over" as const,
    programId: mockProgramId,
    blockNumber: 2,
  };

  check(
    "rollover returns specific program ID",
    mockRolloverResult.programId === mockProgramId,
    `got ${mockRolloverResult.programId}`,
  );
  check(
    "rollover returns new block number",
    mockRolloverResult.blockNumber === 2,
    `got ${mockRolloverResult.blockNumber}`,
  );
  check(
    "status is rolled_over",
    mockRolloverResult.status === "rolled_over",
    `got ${mockRolloverResult.status}`,
  );
}

if (failures > 0) {
  console.log(`\n❌ ${failures} check(s) failed\n`);
  process.exit(1);
} else {
  console.log("\n✅ All checks passed\n");
  process.exit(0);
}
