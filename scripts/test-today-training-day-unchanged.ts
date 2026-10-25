/**
 * Test 3: Training day is unchanged (no extra plannable load; same render).
 *
 * A training day where askAboutToday is false should NOT load plannable days.
 *
 *   npx tsx scripts/test-today-training-day-unchanged.ts
 */

import { shouldLoadPlannableDays } from "../src/lib/today/should-load-plannable";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` -- ${detail}` : ""}`);
}

console.log("\n1. Weights day, askAboutToday=false");
{
  const shouldLoad = shouldLoadPlannableDays({
    askAboutToday: false,
    dayType: "weights",
  });

  check("shouldLoadPlannableDays returns false", shouldLoad === false);
}

console.log("\n2. Bodyweight day, askAboutToday=false");
{
  const shouldLoad = shouldLoadPlannableDays({
    askAboutToday: false,
    dayType: "bodyweight",
  });

  check("shouldLoadPlannableDays returns false", shouldLoad === false);
}

console.log("\n3. Yoga day, askAboutToday=false");
{
  const shouldLoad = shouldLoadPlannableDays({
    askAboutToday: false,
    dayType: "yoga",
  });

  check("shouldLoadPlannableDays returns false", shouldLoad === false);
}

console.log("\n4. Meditation day, askAboutToday=false");
{
  const shouldLoad = shouldLoadPlannableDays({
    askAboutToday: false,
    dayType: "meditation",
  });

  check("shouldLoadPlannableDays returns false", shouldLoad === false);
}

if (failures) {
  console.log(`\n❌ ${failures} failure(s)\n`);
  process.exit(1);
} else {
  console.log("\n✅ All training day tests passed\n");
}
