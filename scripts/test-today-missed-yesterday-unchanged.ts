/**
 * Test 2: Missed-yesterday flow is unchanged (same askAboutToday, same days).
 *
 * When yesterday was missed, today is not rest, and no strength session is done or open,
 * we should still load plannable days (the original behavior).
 *
 *   npx tsx scripts/test-today-missed-yesterday-unchanged.ts
 */

import { shouldLoadPlannableDays } from "../src/lib/today/should-load-plannable";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` -- ${detail}` : ""}`);
}

console.log("\n1. Missed yesterday, training day, no strength done/open loads plannable");
{
  const shouldLoad = shouldLoadPlannableDays({
    missedYesterday: true,
    strengthDone: false,
    strengthOpen: false,
    dayType: "weights",
  });

  check("shouldLoadPlannableDays returns true", shouldLoad === true);
}

console.log("\n2. Missed yesterday but strength done does not load plannable");
{
  const shouldLoad = shouldLoadPlannableDays({
    missedYesterday: true,
    strengthDone: true,
    strengthOpen: false,
    dayType: "weights",
  });

  check("shouldLoadPlannableDays returns false", shouldLoad === false);
}

console.log("\n3. Missed yesterday but strength open does not load plannable");
{
  const shouldLoad = shouldLoadPlannableDays({
    missedYesterday: true,
    strengthDone: false,
    strengthOpen: true,
    dayType: "weights",
  });

  check("shouldLoadPlannableDays returns false", shouldLoad === false);
}

console.log("\n4. No missed yesterday, training day does not load plannable");
{
  const shouldLoad = shouldLoadPlannableDays({
    missedYesterday: false,
    strengthDone: false,
    strengthOpen: false,
    dayType: "weights",
  });

  check("shouldLoadPlannableDays returns false", shouldLoad === false);
}

if (failures) {
  console.log(`\n❌ ${failures} failure(s)\n`);
  process.exit(1);
} else {
  console.log("\n✅ All missed-yesterday tests passed\n");
}
