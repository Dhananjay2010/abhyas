/**
 * Child process helper for testing formatJoinCodeDate under different process.env.TZ values.
 * Run with: tsx scripts/test-format-join-code-date-child.ts <isoDate> <targetTimezone>
 */

import { formatJoinCodeDate } from "../src/lib/format-join-code-date";

const [, , isoDate, targetTimezone] = process.argv;

if (!isoDate || !targetTimezone) {
  console.error("Usage: tsx test-format-join-code-date-child.ts <isoDate> <targetTimezone>");
  process.exit(1);
}

const date = new Date(isoDate);
const result = formatJoinCodeDate(date, targetTimezone);

console.log(result);
