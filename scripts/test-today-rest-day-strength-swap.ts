/**
 * Test 1: Rest day with yesterday not missed loads strength days.
 *
 * A rest day where yesterday was NOT missed should load plannableDays,
 * so the "Or train today anyway" prompt can list strength days.
 *
 *   npx tsx scripts/test-today-rest-day-strength-swap.ts
 */

import { shouldLoadPlannableDays } from "../src/lib/today/should-load-plannable";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` -- ${detail}` : ""}`);
}

console.log("\n1. Rest day with yesterday not missed loads plannable days");
{
  const shouldLoad = shouldLoadPlannableDays({
    missedYesterday: false,
    strengthDone: false,
    strengthOpen: false,
    dayType: "rest",
  });

  check("shouldLoadPlannableDays returns true", shouldLoad === true);
}

console.log("\n2. Rest day with strength done still loads plannable days");
{
  const shouldLoad = shouldLoadPlannableDays({
    missedYesterday: false,
    strengthDone: true,
    strengthOpen: false,
    dayType: "rest",
  });

  check("shouldLoadPlannableDays returns true", shouldLoad === true);
}

console.log("\n3. Rest day with strength open still loads plannable days");
{
  const shouldLoad = shouldLoadPlannableDays({
    missedYesterday: false,
    strengthDone: false,
    strengthOpen: true,
    dayType: "rest",
  });

  check("shouldLoadPlannableDays returns true", shouldLoad === true);
}

console.log("\n4. Rest day with missed yesterday loads plannable days");
{
  const shouldLoad = shouldLoadPlannableDays({
    missedYesterday: true,
    strengthDone: false,
    strengthOpen: false,
    dayType: "rest",
  });

  check("shouldLoadPlannableDays returns true", shouldLoad === true);
}

if (failures) {
  console.log(`\n❌ ${failures} failure(s)\n`);
  process.exit(1);
} else {
  console.log("\n✅ All rest day tests passed\n");
}
