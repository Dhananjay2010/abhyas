/**
 * Test that Today page loads retired days (X8, X9, X16).
 *
 * Kills: X8, X9, X16
 *
 *   npm run test:today-source-check
 */
import * as fs from "fs";
import * as path from "path";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

const todayPath = path.join(__dirname, "../src/app/today/page.tsx");
const todaySource = fs.readFileSync(todayPath, "utf-8");

console.log("\nX8-X9: Today includes retired days in allDays");
{
  const includesRetiredDays = todaySource.includes("...(retiredDays ?? [])");
  const notOnlyActiveDays = !todaySource.match(/const allDays = \[\.\.\..*?\]\s*;/) ||
    todaySource.includes("retiredDays");
  
  check("allDays includes retiredDays", includesRetiredDays);
  check("NOT only active days", notOnlyActiveDays);
}

console.log("\nX16: Retired days query exists");
{
  const hasRetiredDaysQuery = todaySource.includes("loadRetiredDays(") ||
    (todaySource.includes("retiredDayIds") && 
     todaySource.includes("program_days") &&
     todaySource.includes(".in("));
  
  check("retired days are loaded", hasRetiredDaysQuery);
}

if (failures > 0) {
  console.log(`\n❌ ${failures} failure(s)`);
  process.exit(1);
} else {
  console.log("\n✅ All checks passed");
}
