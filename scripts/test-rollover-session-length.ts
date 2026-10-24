/**
 * Test that rollover uses DEFAULT_SESSION_LENGTH (45) when profile has null session minutes.
 * 
 * This test proves the fix: main uses `?? 60`, this PR uses `?? DEFAULT_SESSION_LENGTH`.
 * 
 *   npm run test:rollover-session-length
 */

import { DEFAULT_SESSION_LENGTH } from "../src/lib/onboarding/session-length";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. DEFAULT_SESSION_LENGTH is 45");
check("DEFAULT_SESSION_LENGTH is 45", DEFAULT_SESSION_LENGTH === 45, `got ${DEFAULT_SESSION_LENGTH}`);

console.log("\n2. Rollover.ts imports and uses DEFAULT_SESSION_LENGTH");
{
  // Read the file and verify it imports DEFAULT_SESSION_LENGTH
  const fs = require("fs");
  const rolloverContent = fs.readFileSync("src/lib/program/rollover.ts", "utf-8");
  
  const hasImport = rolloverContent.includes('import { DEFAULT_SESSION_LENGTH }');
  check("Rollover imports DEFAULT_SESSION_LENGTH", hasImport);
  
  const usesFallback = rolloverContent.includes('?? DEFAULT_SESSION_LENGTH');
  check("Rollover uses ?? DEFAULT_SESSION_LENGTH (not ?? 60)", usesFallback);
  
  const uses60 = rolloverContent.match(/preferredSessionMinutes.*\?\?\s*60/);
  check("Rollover does NOT use ?? 60", !uses60, uses60 ? `found: ${uses60[0]}` : "");
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
