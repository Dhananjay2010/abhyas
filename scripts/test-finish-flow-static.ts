/**
 * Static checks for finish-flow wiring in session-runner.tsx
 *
 * Validates:
 * - All finish operations go through runFinish or runEndEarly
 * - No direct calls to actions.finishSession or abandonSession
 * - End early confirm has disabled={busy || ending}
 *
 *   npx tsx scripts/test-finish-flow-static.ts
 */

import fs from "fs";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. No direct calls to actions.finishSession in session-runner.tsx");
{
  const content = fs.readFileSync("src/app/session/[id]/session-runner.tsx", "utf-8");
  const hasDirectFinish = content.includes("actions.finishSession(") || content.includes("actions.finishSession (");
  check("no direct actions.finishSession calls", !hasDirectFinish, "");
}

console.log("\n2. No direct calls to actions.abandonSession in session-runner.tsx");
{
  const content = fs.readFileSync("src/app/session/[id]/session-runner.tsx", "utf-8");
  const hasDirectAbandon = content.includes("actions.abandonSession(") || content.includes("actions.abandonSession (");
  check("no direct actions.abandonSession calls", !hasDirectAbandon, "");
}

console.log("\n3. All finish operations use runFinish from finish-flow");
{
  const content = fs.readFileSync("src/app/session/[id]/session-runner.tsx", "utf-8");
  const hasRunFinishImport = content.includes("import") && content.includes("runFinish") && content.includes("finish-flow");
  const hasRunFinishCall = content.includes("runFinish(");
  check("imports runFinish from finish-flow", hasRunFinishImport, "");
  check("calls runFinish", hasRunFinishCall, "");
}

console.log("\n4. All end-early operations use runEndEarly from finish-flow");
{
  const content = fs.readFileSync("src/app/session/[id]/session-runner.tsx", "utf-8");
  const hasRunEndEarlyImport = content.includes("import") && content.includes("runEndEarly") && content.includes("finish-flow");
  const hasRunEndEarlyCall = content.includes("runEndEarly(");
  check("imports runEndEarly from finish-flow", hasRunEndEarlyImport, "");
  check("calls runEndEarly", hasRunEndEarlyCall, "");
}

console.log("\n5. EndEarlyConfirm has disabled={busy || ending}");
{
  const content = fs.readFileSync("src/app/session/[id]/session-runner.tsx", "utf-8");
  
  // Find the EndEarlyConfirm component usage
  const endEarlyConfirmMatch = content.match(/<EndEarlyConfirm[\s\S]*?\/>/);
  if (endEarlyConfirmMatch) {
    const componentText = endEarlyConfirmMatch[0];
    const hasDisabled = componentText.includes("disabled={busy || ending}");
    check("EndEarlyConfirm has disabled={busy || ending}", hasDisabled, "");
  } else {
    check("EndEarlyConfirm found in component", false, "component not found");
  }
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
