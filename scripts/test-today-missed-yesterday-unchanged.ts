/**
 * Test 2: Missed-yesterday flow is unchanged (same askAboutToday, same days).
 *
 * When askAboutToday is true (missed yesterday, not rest, no strength done/open),
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

console.log("\n1. askAboutToday=true loads plannable (original behavior)");
{
  const shouldLoad = shouldLoadPlannableDays({
    askAboutToday: true,
    dayType: "weights",
  });

  check("shouldLoadPlannableDays returns true", shouldLoad === true);
}

console.log("\n2. askAboutToday=false on training day does not load");
{
  const shouldLoad = shouldLoadPlannableDays({
    askAboutToday: false,
    dayType: "weights",
  });

  check("shouldLoadPlannableDays returns false", shouldLoad === false);
}

console.log("\n3. askAboutToday=false on bodyweight day does not load");
{
  const shouldLoad = shouldLoadPlannableDays({
    askAboutToday: false,
    dayType: "bodyweight",
  });

  check("shouldLoadPlannableDays returns false", shouldLoad === false);
}

if (failures) {
  console.log(`\n❌ ${failures} failure(s)\n`);
  process.exit(1);
} else {
  console.log("\n✅ All missed-yesterday tests passed\n");
}
