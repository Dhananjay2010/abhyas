/**
 * Test that repoint-sessions enforces day_type matching (NEW1).
 *
 * Kills: NEW1
 *
 *   npm run test:repoint-source-check
 */
import * as fs from "fs";
import * as path from "path";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

const repointPath = path.join(__dirname, "../src/lib/program/repoint-sessions.ts");
const repointSource = fs.readFileSync(repointPath, "utf-8");

console.log("\nNEW1: day_type is checked in matching");
{
  // The match function should check day_type along with label
  const labelMatchChecksDayType = repointSource.includes("d.label") && 
    repointSource.includes("d.day_type === chosenType");
  
  check("label match checks day_type", labelMatchChecksDayType);
}

if (failures > 0) {
  console.log(`\n❌ ${failures} failure(s)`);
  process.exit(1);
} else {
  console.log("\n✅ All checks passed");
}
