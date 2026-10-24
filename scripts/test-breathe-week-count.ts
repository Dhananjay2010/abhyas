export {};
/**
 * Test: 'This week' double count fix.
 *
 * A just-saved session must be counted once in "This week", including after a retry.
 * This test verifies the week display logic in breathing-session.tsx.
 *
 *   npx tsx scripts/test-breathe-week-count.ts
 */

import { readFileSync } from "fs";
import { join } from "path";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Week count logic in breathing-session.tsx\n");

const filePath = join(process.cwd(), 'src/app/breathe/[slug]/session/breathing-session.tsx');
const content = readFileSync(filePath, 'utf-8');

// Check that onSaved is only called when wasAlreadySaved is false
check(
  "onSaved guard exists",
  content.includes("const wasAlreadySaved = savedOkRef.current") &&
  content.includes("if (!wasAlreadySaved)") &&
  content.includes("onSaved(o.seconds)")
);

// Check that savedOkRef is set AFTER checking wasAlreadySaved
const savedOkRefIndex = content.indexOf("savedOkRef.current = true");
const wasAlreadySavedIndex = content.indexOf("const wasAlreadySaved = savedOkRef.current");
const onSavedCallIndex = content.indexOf("if (!wasAlreadySaved) {");

check(
  "wasAlreadySaved check comes before setting savedOkRef",
  wasAlreadySavedIndex > 0 && savedOkRefIndex > 0 && wasAlreadySavedIndex < savedOkRefIndex,
  `wasAlreadySaved at ${wasAlreadySavedIndex}, savedOkRef set at ${savedOkRefIndex}`
);

check(
  "onSaved only called when not already saved",
  onSavedCallIndex > 0 && onSavedCallIndex > wasAlreadySavedIndex,
  "onSaved is guarded by !wasAlreadySaved check"
);

// Check that the week computation adds savedSeconds only once
check(
  "week.seconds computation",
  content.includes("props.week.seconds + savedSeconds") || content.includes("week.seconds + savedSeconds"),
  "week includes savedSeconds"
);

// Check that onSaved uses a functional update
check(
  "onSaved uses functional update",
  content.includes("setSavedSeconds((n) => n + seconds)"),
  "functional update ensures correct accumulation"
);

console.log("\n2. Early return guard\n");

// Check that there's an early return if already saved
check(
  "early return guard exists",
  content.includes("if (savedOkRef.current) {") && content.includes("return;"),
  "doSave returns early if already saved"
);

// Check that the early return comes before calling guardedSave
const earlyReturnIndex = content.indexOf("if (savedOkRef.current) {");
const guardedSaveCallIndex = content.indexOf("guardedSave(o, guidance)");

check(
  "early return before guardedSave",
  earlyReturnIndex > 0 && guardedSaveCallIndex > 0 && earlyReturnIndex < guardedSaveCallIndex,
  "saves are blocked after first success"
);

if (failures === 0) {
  console.log("\nALL CHECKS PASSED\n");
} else {
  console.log(`\n❌ ${failures} test(s) failed\n`);
  process.exit(1);
}
