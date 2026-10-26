import React from "react";
import { ReplayConflictNotice } from "@/components/replay-conflict-notice";
import { renderToString } from "react-dom/server";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testNoticeWithConflicts() {
  console.log("\n▶ Testing conflict notice shows with conflicts...");
  
  const html = renderToString(React.createElement(ReplayConflictNotice, { conflicts: 2 }));
  
  assert(html.includes("2 sets"), "Should show conflict count");
  assert(html.includes("already recorded"), "Should explain conflict reason");
  console.log("  ✓ Notice shows with conflicts>0");
}

function testNoticeHiddenWithZero() {
  console.log("\n▶ Testing notice hidden with 0 conflicts...");
  
  const html = renderToString(React.createElement(ReplayConflictNotice, { conflicts: 0 }));
  
  assert(html === "", "Should render nothing");
  console.log("  ✓ Notice hidden at 0");
}

function testSingleConflict() {
  console.log("\n▶ Testing singular text with 1 conflict...");
  
  const html = renderToString(React.createElement(ReplayConflictNotice, { conflicts: 1 }));
  
  assert(html.includes("One set"), "Should use singular text");
  assert(html.includes("That set was already recorded"), "Should use singular explanation");
  console.log("  ✓ Singular text for 1 conflict");
}

console.log("Testing Replay Conflict Notice");
console.log("==============================");

try {
  testNoticeWithConflicts();
  testNoticeHiddenWithZero();
  testSingleConflict();
  console.log("\n✅ All replay conflict notice tests passed\n");
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n❌ Test error: ${message}\n`);
  process.exit(1);
}
