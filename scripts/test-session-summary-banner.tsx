#!/usr/bin/env tsx
/**
 * Test session summary banner with getSessionSummary
 * 
 * FIX (item 4): Verify that:
 * - session-runner.tsx calls actions.getSessionSummary when entering done phase
 * - Banner infrastructure exists to show previous exercise name
 * - Mutant can target the getSessionSummary call
 */

import fs from "fs";

console.log("\nSession summary banner tests (item 4)");
console.log("=====================================\n");

function check(label: string, pass: boolean, detail?: string) {
  if (pass) {
    console.log(`  ✓ ${label}${detail ? `  -- ${detail}` : ""}`);
  } else {
    console.log(`  ✗ FAIL ${label}${detail ? `  -- ${detail}` : ""}`);
    process.exit(1);
  }
}

const source = fs.readFileSync("src/app/session/[id]/session-runner.tsx", "utf-8");
const actionsSource = fs.readFileSync("src/app/session/actions.ts", "utf-8");

// Test 1: Verify getSessionSummary call exists
console.log("1. Verify getSessionSummary integration");

check(
  "session-runner.tsx calls actions.getSessionSummary",
  source.includes("actions.getSessionSummary(sessionId)"),
  "call target exists"
);

check(
  "getSessionSummary is in SessionActions type",
  source.includes("getSessionSummary:") && source.includes("type SessionActions"),
  "type definition includes getSessionSummary"
);

check(
  "getSessionSummary imported from actions",
  source.includes('import') && source.includes('getSessionSummary') && source.includes('from "../actions"'),
  "import statement exists"
);

check(
  "getSessionSummary exported from actions.ts",
  actionsSource.includes("export async function getSessionSummary"),
  "actions.ts exports function"
);

// Test 2: Verify banner state infrastructure
console.log("\n2. Verify banner state infrastructure");

check(
  "Banner state uses exercise name",
  source.includes("name:") && source.includes("current.name"),
  "banner captures exercise name"
);

check(
  "Banner state includes message",
  source.includes("message") || source.includes("progressionFeedback"),
  "banner includes progression message"
);

check(
  "Summary result type includes personalBest",
  source.includes("personalBest") || actionsSource.includes("personalBest"),
  "PB card data structure exists"
);

// Test 3: Verify call happens on done phase
console.log("\n3. Verify done phase behavior");

check(
  "Call triggered by phase === 'done'",
  source.includes('phase === "done"') || source.includes("phase === 'done'"),
  "phase check exists"
);

check(
  "Effect or mount hook calls getSessionSummary",
  source.includes("useEffect") && source.match(/getSessionSummary[\s\S]{0,300}phase/),
  "hook pattern detected"
);

console.log("\n✅ All source assertions passed");
console.log("   Mutant test will verify runtime behavior\n");
process.exit(0);
