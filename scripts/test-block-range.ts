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

console.log("\n4. blockForDate: overlap detection in non-production");
{
  const overlapping = [
    b("1", "2026-10-01", "2026-10-28"),
    b("2", "2026-10-15", "2026-11-11"), // overlaps with block 1
  ];

  const oldNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    let threw = false;
    try {
      blockForDate(overlapping, "2026-10-20");
    } catch (e) {
      threw = (e as Error).message.includes("Multiple blocks cover");
    }
    check("throws in non-production for overlap", threw);
  } finally {
    process.env.NODE_ENV = oldNodeEnv;
  }

  // In production, doesn't throw
  process.env.NODE_ENV = "production";
  const result = blockForDate(overlapping, "2026-10-20");
  check("returns first covering block in production", result?.id === "1");
  process.env.NODE_ENV = oldNodeEnv;
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
  check("week 2 on day 7", cycleWeekFor(block1, "2026-10-07") === 1); // 7 days elapsed = floor(7/7) = 1, +1 = week 2
  check("week 2 on day 8", cycleWeekFor(block1, "2026-10-08") === 2);
  check("week 3 on day 15", cycleWeekFor(block1, "2026-10-15") === 3);

  // Mid-block rebuild at week 3: new block gets week_offset = 2
  const block2 = b("2", "2026-10-15", null, 2); // week_offset 2 (was in week 3, so offset 2)
  check("rebuild keeps cycle week: day 1 is week 3", cycleWeekFor(block2, "2026-10-15") === 3);
  check("rebuild week 4 on day 7", cycleWeekFor(block2, "2026-10-21") === 3); // 6 days / 7 = 0, +2+1 = 3
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
  } catch (e) {
    threw = (e as Error).message.includes("before block start");
  }
  check("throws for date before started_on", threw);
}

if (failures === 0) {
  console.log("\nALL CHECKS PASSED");
  process.exit(0);
} else {
  console.error(`\n${failures} CHECKS FAILED`);
  process.exit(1);
}
