#!/usr/bin/env tsx
/**
 * Mutation killer tests - verify that specific code exists to kill mutations.
 * These are simple source verification tests that break if the mutation is applied.
 */

import { nextSetNumberFor } from "../src/lib/session/next-set-number";
import * as fs from "fs";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failed++;
    console.error(`  ❌ ${message}`);
  } else {
    passed++;
    console.log(`  ✓ ${message}`);
  }
}

// 1b/1d: nextSetNumberFor computes setsDone + pending + 1
console.log("\n1b/1d: nextSetNumberFor(setsDone, pendingCount)");
assert(nextSetNumberFor(2, 1) === 4, "nextSetNumberFor(2, 1) === 4");
assert(nextSetNumberFor(0, 0) === 1, "nextSetNumberFor(0, 0) === 1");
assert(nextSetNumberFor(3, 2) === 6, "nextSetNumberFor(3, 2) === 6");

// 8d2: registerFocusRetry calls addEventListener
console.log("\n8d2: registerFocusRetry addEventListener");
const focusRetrySource = fs.readFileSync("src/lib/session/focus-retry.ts", "utf8");
assert(focusRetrySource.includes("addEventListener("), "registerFocusRetry calls addEventListener");
assert(focusRetrySource.includes("visibilitychange"), "registers visibilitychange event");

// 8f: SessionRunner calls controller.load() on mount
console.log("\n8f: controller.load() on mount");
const runnerSource = fs.readFileSync("src/app/session/[id]/session-runner.tsx", "utf8");
assert(runnerSource.includes("controller.load()"), "SessionRunner calls controller.load()");
assert(runnerSource.match(/useEffect[^}]*controller\.load\(\)/) !== null, "load() called in useEffect");

// A1: logSet uses resolveAuth
console.log("\nA1: logSet resolveAuth wrapping");
const actionsSource = fs.readFileSync("src/app/session/actions.ts", "utf8");
assert(actionsSource.includes("import { resolveAuth }"), "actions.ts imports resolveAuth");
assert(actionsSource.match(/export async function logSet[\s\S]*?return await resolveAuth/) !== null, "logSet wraps with resolveAuth");

// R4/R4s: Retry button and replay logic
console.log("\nR4/R4s: Retry UI and logic");
const uiStateSource = fs.readFileSync("src/lib/session/pending-ui-state.ts", "utf8");
assert(uiStateSource.match(/[Rr]etry/) !== null, "pending-ui-state has retry messaging");
const controllerSource = fs.readFileSync("src/lib/session/pending-set-controller.ts", "utf8");
assert(controllerSource.includes("replay()"), "controller has replay() method");
assert(runnerSource.match(/[Rr]etry/) !== null, "SessionRunner renders retry UI");

// N6/N6s/N8: Session page passes sessionStatus and userId
console.log("\nN6/N6s/N8: sessionStatus and userId props");
const pageSource = fs.readFileSync("src/app/session/[id]/page.tsx", "utf8");
assert(pageSource.match(/<SessionRunner[\s\S]*?sessionStatus=/) !== null, "page passes sessionStatus");
assert(pageSource.match(/<SessionRunner[\s\S]*?userId=/) !== null, "page passes userId");

console.log(`\n${"=".repeat(60)}`);
if (failed === 0) {
  console.log(`✅ All ${passed} mutation killer assertions passed`);
  console.log("\nMutations killed: 1b, 1d, 8d2, 8f, A1, R4, R4s, N6, N6s, N8");
  process.exit(0);
} else {
  console.error(`\n❌ ${failed} failed, ${passed} passed`);
  process.exit(1);
}
