/**
 * Block range utilities: coverage, empty ranges, block numbering, cycle weeks.
 *
 * Tests the pure functions in src/lib/program/block-range.ts that fix the
 * mid-block rebuild bug (M-1) and handle concurrent rollover (E-3).
 *
 *   npx tsx scripts/test-block-range.ts
 */
import {
  coversDate,
  isEmptyRange,
  blockForDate,
  blockNumberFor,
  cycleWeekFor,
  type BlockRange,
} from "../src/lib/program/block-range";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

const b = (
  id: string,
  started_on: string,
  ended_on: string | null,
  week_offset?: number,
): BlockRange => ({
  id,
  started_on,
  ended_on,
  week_offset,
});

console.log("\n1. coversDate: inclusive range, NULL ended_on means active");
{
  const block = b("1", "2026-10-01", "2026-10-28");
  check("started_on is covered", coversDate(block, "2026-10-01"));
  check("ended_on is covered (inclusive)", coversDate(block, "2026-10-28"));
  check("middle is covered", coversDate(block, "2026-10-15"));
  check("before started_on is not covered", !coversDate(block, "2026-09-30"));
  check("after ended_on is not covered", !coversDate(block, "2026-10-29"));

  const active = b("2", "2026-10-29", null);
  check("NULL ended_on covers future", coversDate(active, "2026-11-15"));
  check("NULL ended_on covers today", coversDate(active, "2026-10-29"));
}

console.log("\n2. isEmptyRange: legacy rebuilds become empty ranges");
{
  const legacy = b("old", "2026-10-15", "2026-10-14"); // ended_on < started_on
  check("ended_on < started_on is empty", isEmptyRange(legacy));

  const sameDay = b("rebuild", "2026-10-15", "2026-10-14"); // same-day second rebuild
  check("same-day double rebuild is empty", isEmptyRange(sameDay));

  const normal = b("normal", "2026-10-01", "2026-10-28");
  check("normal range is not empty", !isEmptyRange(normal));

  const active = b("active", "2026-10-29", null);
  check("NULL ended_on is not empty", !isEmptyRange(active));
}

console.log("\n3. blockForDate: range rule only, never 'newest'");
{
  const blocks = [
    b("1", "2026-10-01", "2026-10-28"),
    b("2", "2026-10-29", "2026-11-25"),
  ];
  check("finds block 1 for Oct 15", blockForDate(blocks, "2026-10-15")?.id === "1");
  check("finds block 2 for Nov 15", blockForDate(blocks, "2026-11-15")?.id === "2");
  check("returns null for date before any block", blockForDate(blocks, "2026-09-15") === null);

  // Empty range (legacy rebuild) doesn't cover anything
  const withEmpty = [
    b("old", "2026-10-01", "2026-09-30"), // empty
    b("new", "2026-10-01", "2026-10-28"), // real
  ];
  check("empty range doesn't cover started_on", blockForDate(withEmpty, "2026-10-01")?.id === "new");
  check("empty range doesn't cover any date", blockForDate([withEmpty[0]], "2026-10-01") === null);
}

console.log("\n4. blockForDate: no gaps in coverage");
{
  const blocks = [
    b("1", "2026-10-01", "2026-10-28"),
    b("2", "2026-10-29", "2026-11-25"),
    b("3", "2026-11-26", null),
  ];
  
  check("Oct 28 (end of block 1) is covered", blockForDate(blocks, "2026-10-28")?.id === "1");
  check("Oct 29 (start of block 2) is covered", blockForDate(blocks, "2026-10-29")?.id === "2");
  check("Nov 25 (end of block 2) is covered", blockForDate(blocks, "2026-11-25")?.id === "2");
  check("Nov 26 (start of block 3) is covered", blockForDate(blocks, "2026-11-26")?.id === "3");
  check("future date is covered by active block", blockForDate(blocks, "2027-01-15")?.id === "3");
}

console.log("\n5. blockNumberFor: 1-based, by started_on order, skips empty ranges");
{
  const blocks = [
    b("1", "2026-10-01", "2026-10-28"),
    b("empty", "2026-10-29", "2026-10-28"), // empty
    b("2", "2026-10-29", "2026-11-25"),
  ];

  check("first block is 1", blockNumberFor(blocks, "1") === 1);
  check("empty range has no number", blockNumberFor(blocks, "empty") === null);
  check("second non-empty block is 2", blockNumberFor(blocks, "2") === 2);
  check("missing block is null", blockNumberFor(blocks, "missing") === null);

  // Out of order input
  const unordered = [blocks[2], blocks[0], blocks[1]];
  check("ordering is by started_on, not input order", blockNumberFor(unordered, "2") === 2);
}

console.log("\n6. cycleWeekFor: week_offset carries deload across rebuild");
{
  const block1 = b("1", "2026-10-01", null, 0); // week_offset 0
  check("week 1 on day 1", cycleWeekFor(block1, "2026-10-01") === 1);
  check("week 1 on day 6", cycleWeekFor(block1, "2026-10-06") === 1);
  check("week 2 on day 8", cycleWeekFor(block1, "2026-10-08") === 2); // 7 days elapsed = floor(7/7) = 1, +1 = week 2
  check("week 3 on day 15", cycleWeekFor(block1, "2026-10-15") === 3);

  // Mid-block rebuild at week 3: new block gets week_offset = 2
  const block2 = b("2", "2026-10-15", null, 2); // week_offset 2 (was in week 3, so offset 2)
  check("rebuild keeps cycle week: day 1 is week 3", cycleWeekFor(block2, "2026-10-15") === 3);
  check("rebuild week 3 on day 7", cycleWeekFor(block2, "2026-10-21") === 3); // 6 days / 7 = 0, +2+1 = 3
  check("rebuild week 4 on day 8", cycleWeekFor(block2, "2026-10-22") === 4); // 7 days / 7 = 1, +2+1 = 4

  // Default week_offset when missing
  const legacy = b("legacy", "2026-10-01", null); // no week_offset
  check("missing week_offset defaults to 0", cycleWeekFor(legacy, "2026-10-01") === 1);
}

console.log("\n7. cycleWeekFor: throws on date before block start");
{
  const block = b("1", "2026-10-15", null);
  let threw = false;
  try {
    cycleWeekFor(block, "2026-10-14");
  } catch (error) {
    threw = error instanceof Error && error.message.includes("before block start");
  }
  check("throws for date before started_on", threw);
}

console.log("\n8. blockForDate: throws on overlap in non-production");
{
  // Save original NODE_ENV
  const originalEnv = process.env.NODE_ENV;
  
  // Test in non-production mode
  delete (process.env as { NODE_ENV?: string }).NODE_ENV;
  (process.env as { NODE_ENV?: string }).NODE_ENV = "development";
  
  const overlappingBlocks = [
    b("1", "2026-10-01", "2026-10-28"),
    b("2", "2026-10-15", "2026-11-15"), // overlaps with block 1
  ];
  
  let threw = false;
  try {
    blockForDate(overlappingBlocks, "2026-10-20"); // covered by both
  } catch (error) {
    threw = error instanceof Error && error.message.includes("Multiple blocks cover");
  }
  check("throws on overlap in non-production", threw);
  
  // Test in production mode (should not throw)
  delete (process.env as { NODE_ENV?: string }).NODE_ENV;
  (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
  let threwInProd = false;
  try {
    const result = blockForDate(overlappingBlocks, "2026-10-20");
    check("returns first match in production", result?.id === "1");
  } catch {
    threwInProd = true;
  }
  check("does not throw in production", !threwInProd);
  
  // Restore original NODE_ENV
  delete (process.env as { NODE_ENV?: string }).NODE_ENV;
  if (originalEnv !== undefined) {
    (process.env as { NODE_ENV?: string }).NODE_ENV = originalEnv;
  }
}

console.log("\n9. blockForDate: endedOn-null fallback to endsOn");
{
  // In the real schema, ended_on can be null (active block) or set (completed/superseded)
  // coversDate uses ended_on when checking range, so blockForDate does too
  // This test verifies blockForDate correctly handles ended_on = null (active blocks)
  
  type BlockWithBoth = BlockRange & { endsOn?: string };
  
  const blocks: BlockWithBoth[] = [
    { id: "1", started_on: "2026-10-01", ended_on: "2026-10-28", endsOn: "2026-10-28" },
    { id: "2", started_on: "2026-10-29", ended_on: null, endsOn: "2026-11-25" }, // active block
  ];
  
  // blockForDate uses ended_on (not endsOn) for coverage check
  const oct15 = blockForDate(blocks, "2026-10-15");
  const nov15 = blockForDate(blocks, "2026-11-15");
  const dec15 = blockForDate(blocks, "2026-12-15"); // after endsOn but ended_on is null
  
  check("Oct 15 covered by block 1 (ended_on = 2026-10-28)", oct15?.id === "1");
  check("Nov 15 covered by block 2 (ended_on = null)", nov15?.id === "2");
  check("Dec 15 covered by block 2 (ended_on = null means infinite)", dec15?.id === "2");
  
  // Verify ended_on is what matters, not endsOn
  const afterPlannedEnd = blockForDate(blocks, "2026-12-01");
  check("date after endsOn still covered when ended_on is null", afterPlannedEnd?.id === "2");
}

console.log("\nH1: cycleWeekFor with week_offset grid test (parity with SQL)");
{
  // Test grid: offsets 0-3, dates spanning 0-40 days from start
  const startDate = "2026-10-01";
  const offsets = [0, 1, 2, 3];
  const daysToTest = [0, 1, 6, 7, 8, 13, 14, 20, 21, 27, 28, 35, 40];
  
  for (const offset of offsets) {
    for (const days of daysToTest) {
      const testDate = new Date(new Date(startDate + "T00:00:00Z").getTime() + days * 24 * 60 * 60 * 1000)
        .toISOString().split("T")[0];
      
      const block = { started_on: startDate, week_offset: offset };
      const tsWeek = cycleWeekFor(block, testDate);
      
      // SQL formula: week_offset + floor((date - started_on) / 7) + 1
      const expectedWeek = offset + Math.floor(days / 7) + 1;
      
      check(
        `offset=${offset}, day=${days}: TS week ${tsWeek} = SQL week ${expectedWeek}`,
        tsWeek === expectedWeek,
        `got ${tsWeek}`
      );
    }
  }
}

if (failures === 0) {
  console.log("\nALL CHECKS PASSED");
  process.exit(0);
} else {
  console.error(`\n${failures} CHECKS FAILED`);
  process.exit(1);
}
