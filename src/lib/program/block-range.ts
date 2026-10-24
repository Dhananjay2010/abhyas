/**
 * Block range utilities: pure functions for date coverage and block numbering.
 *
 * DATES ARE STRINGS: 'YYYY-MM-DD' member-local dates compared lexicographically.
 * NO Date.now() or database calls. All functions are deterministic and testable.
 */

export type BlockRange = {
  id: string;
  started_on: string;
  ended_on: string | null;
  week_offset?: number;
};

/**
 * Check if a block covers a given date (inclusive range).
 * ended_on is INCLUSIVE when present, NULL means still active.
 */
export function coversDate(b: BlockRange, date: string): boolean {
  return b.started_on <= date && (b.ended_on === null || date <= b.ended_on);
}

/**
 * Check if a range is empty (ended before it started).
 * Legacy rebuilds become empty ranges because they kept started_on.
 */
export function isEmptyRange(b: BlockRange): boolean {
  return b.ended_on !== null && b.ended_on < b.started_on;
}

/**
 * Find the block covering a given date, using range coverage only.
 * Returns null if no block covers the date.
 *
 * In non-production, throws if multiple blocks cover the same date
 * (should never happen with proper ended_on bookkeeping).
 */
export function blockForDate<T extends BlockRange>(
  blocks: T[],
  date: string,
): T | null {
  const covering = blocks.filter((b) => coversDate(b, date));

  if (covering.length === 0) return null;

  if (covering.length > 1 && process.env.NODE_ENV !== "production") {
    throw new Error(
      `Multiple blocks cover ${date}: ${covering.map((b) => b.id).join(", ")}`,
    );
  }

  return covering[0];
}

/**
 * Compute the 1-based block number for a block ID.
 * Blocks are numbered by started_on order, skipping empty ranges.
 * Returns null if the block is empty or not found.
 */
export function blockNumberFor(
  blocks: BlockRange[],
  blockId: string,
): number | null {
  const target = blocks.find((b) => b.id === blockId);
  if (!target || isEmptyRange(target)) return null;

  const ordered = [...blocks]
    .filter((b) => !isEmptyRange(b))
    .sort((a, b) => a.started_on.localeCompare(b.started_on));

  const index = ordered.findIndex((b) => b.id === blockId);
  return index === -1 ? null : index + 1;
}

/**
 * Compute the cycle week for a given date within a block.
 * Used by generator/deload logic. Week 1 starts on the block's started_on.
 *
 * Formula: (week_offset ?? 0) + floor(daysBetween(started_on, date) / 7) + 1
 */
export function cycleWeekFor(b: BlockRange, date: string): number {
  if (date < b.started_on) {
    throw new Error(`Date ${date} is before block start ${b.started_on}`);
  }

  const startMs = new Date(b.started_on + "T00:00:00Z").getTime();
  const dateMs = new Date(date + "T00:00:00Z").getTime();
  const daysBetween = Math.floor((dateMs - startMs) / (24 * 60 * 60 * 1000));

  return (b.week_offset ?? 0) + Math.floor(daysBetween / 7) + 1;
}
