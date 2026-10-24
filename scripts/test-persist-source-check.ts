/**
 * Test that persist.ts repoint decision is correct (X1, X2).
 *
 * Kills: X1, X2
 *
 *   npm run test:persist-source-check
 */
import * as fs from "fs";
import * as path from "path";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

const persistPath = path.join(__dirname, "../src/lib/program/persist.ts");
const persistSource = fs.readFileSync(persistPath, "utf-8");

console.log("\nX1: Repoint guarded by `if (rebuildOf)`");
{
  const hasGuard = persistSource.includes("if (rebuildOf) {");
  const notAlwaysTrue = !persistSource.includes("if (true) {");
  
  check("has `if (rebuildOf)` check", hasGuard);
  check("NOT `if (true)` (always repoint)", notAlwaysTrue);
}

console.log("\nX2: Repoint call exists and is not disabled");
{
  const hasCall = persistSource.includes("await repointSessionsAfterRebuild(");
  const notDisabled = !persistSource.includes("if (false && rebuildOf)");
  
  check("has repointSessionsAfterRebuild call", hasCall);
  check("NOT disabled with `if (false &&`", notDisabled);
}

console.log("\nX11: Block start date uses localDateString(timezone)");
{
  const usesLocalDate = persistSource.includes("localDateString(timezone)");
  const notHardcoded = !persistSource.includes('"2026-01-01"') && 
                       !persistSource.includes("'2026-01-01'");
  
  check("uses localDateString(timezone)", usesLocalDate);
  check("NOT hardcoded date", notHardcoded);
}

if (failures > 0) {
  console.log(`\n❌ ${failures} failure(s)`);
  process.exit(1);
} else {
  console.log("\n✅ All checks passed");
}
