/**
 * Test 3: Training day is unchanged (no extra plannable load; same render).
 *
 * A training day where yesterday was not missed should NOT load plannable days.
 *
 *   npx tsx scripts/test-today-training-day-unchanged.ts
 */

import { shouldLoadPlannableDays } from "../src/lib/today/should-load-plannable";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` -- ${detail}` : ""}`);
}

console.log("\n1. Weights day, no missed yesterday, no strength done/open");
{
  const shouldLoad = shouldLoadPlannableDays({
    missedYesterday: false,
    strengthDone: false,
    strengthOpen: false,
    dayType: "weights",
  });

  check("shouldLoadPlannableDays returns false", shouldLoad === false);
}

console.log("\n2. Bodyweight day, no missed yesterday, no strength done/open");
{
  const shouldLoad = shouldLoadPlannableDays({
    missedYesterday: false,
    strengthDone: false,
    strengthOpen: false,
    dayType: "bodyweight",
  });

  check("shouldLoadPlannableDays returns false", shouldLoad === false);
}

console.log("\n3. Yoga day, no missed yesterday");
{
  const shouldLoad = shouldLoadPlannableDays({
    missedYesterday: false,
    strengthDone: false,
    strengthOpen: false,
    dayType: "yoga",
  });

  check("shouldLoadPlannableDays returns false", shouldLoad === false);
}

console.log("\n4. Meditation day, no missed yesterday");
{
  const shouldLoad = shouldLoadPlannableDays({
    missedYesterday: false,
    strengthDone: false,
    strengthOpen: false,
    dayType: "meditation",
  });

  check("shouldLoadPlannableDays returns false", shouldLoad === false);
}

console.log("\n5. Training day with strength done");
{
  const shouldLoad = shouldLoadPlannableDays({
    missedYesterday: false,
    strengthDone: true,
    strengthOpen: false,
    dayType: "weights",
  });

  check("shouldLoadPlannableDays returns false", shouldLoad === false);
}

console.log("\n6. Training day with strength open");
{
  const shouldLoad = shouldLoadPlannableDays({
    missedYesterday: false,
    strengthDone: false,
    strengthOpen: true,
    dayType: "weights",
  });

  check("shouldLoadPlannableDays returns false", shouldLoad === false);
}

if (failures) {
  console.log(`\n❌ ${failures} failure(s)\n`);
  process.exit(1);
} else {
  console.log("\n✅ All training day tests passed\n");
}
