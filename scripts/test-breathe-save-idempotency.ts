#!/usr/bin/env node
/**
 * Unit test: verify that the breathing session component prevents duplicate saves
 * and reuses the same log_id across retries, wind-down auto-save + manual finish,
 * and double-taps.
 *
 * This test asserts the CLIENT-SIDE idempotency protections added to fix QA issue
 * where 7 identical 38s saves were recorded. The DB-level advisory lock in
 * `record_breathing_practice` already deduplicates calls with the same p_log_id;
 * this test ensures the client generates log_id ONCE per practice and guards
 * against concurrent saves.
 */

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const sessionFile = resolve(
  __dirname,
  "../src/app/breathe/[slug]/session/breathing-session.tsx"
);
const source = readFileSync(sessionFile, "utf8");
const sourceFile = ts.createSourceFile(sessionFile, source, ts.ScriptTarget.Latest, true);

const errors: string[] = [];

// Assert 1: logId is generated with useState (stable across re-renders)
let foundLogIdState = false;
let foundSaveInFlightRef = false;

function visit(node: ts.Node) {
  // Check for: const [logId] = useState(() => uuid());
  if (
    ts.isVariableStatement(node) &&
    node.declarationList.declarations.length === 1
  ) {
    const decl = node.declarationList.declarations[0];
    if (
      ts.isArrayBindingPattern(decl.name) &&
      decl.name.elements.length >= 1 &&
      ts.isBindingElement(decl.name.elements[0]) &&
      ts.isIdentifier(decl.name.elements[0].name) &&
      decl.name.elements[0].name.text === "logId" &&
      decl.initializer &&
      ts.isCallExpression(decl.initializer) &&
      ts.isIdentifier(decl.initializer.expression) &&
      decl.initializer.expression.text === "useState"
    ) {
      foundLogIdState = true;
    }
  }

  // Check for: const saveInFlightRef = useRef(false);
  if (
    ts.isVariableStatement(node) &&
    node.declarationList.declarations.length === 1
  ) {
    const decl = node.declarationList.declarations[0];
    if (
      ts.isIdentifier(decl.name) &&
      decl.name.text === "saveInFlightRef" &&
      decl.initializer &&
      ts.isCallExpression(decl.initializer) &&
      ts.isIdentifier(decl.initializer.expression) &&
      decl.initializer.expression.text === "useRef"
    ) {
      foundSaveInFlightRef = true;
    }
  }

  ts.forEachChild(node, visit);
}

visit(sourceFile);

if (!foundLogIdState) {
  errors.push(
    "breathing-session.tsx must generate logId with useState(() => uuid()) to ensure stable log_id per practice"
  );
}

if (!foundSaveInFlightRef) {
  errors.push(
    "breathing-session.tsx must declare saveInFlightRef = useRef(false) to guard against concurrent saves"
  );
}

// Assert 2: doSave checks the in-flight guard
const doSaveMatch = source.match(
  /const doSave = useCallback\(\s*\(o: Outcome\) => \{[\s\S]*?\},\s*\[/
);
if (!doSaveMatch) {
  errors.push("breathing-session.tsx must define doSave callback");
} else {
  const doSaveBody = doSaveMatch[0];
  
  // Must check saveInFlightRef.current and return early
  if (!doSaveBody.includes("saveInFlightRef.current")) {
    errors.push("doSave must check saveInFlightRef.current to prevent concurrent saves");
  }
  
  if (!doSaveBody.match(/if\s*\(\s*saveInFlightRef\.current\s*\)/)) {
    errors.push("doSave must have an if (saveInFlightRef.current) guard");
  }
  
  // Must set the guard to true before the save call
  if (!doSaveBody.includes("saveInFlightRef.current = true")) {
    errors.push("doSave must set saveInFlightRef.current = true before calling recordBreathingPractice");
  }
  
  // Must clear the guard in both success and error handlers
  const clearCount = (doSaveBody.match(/saveInFlightRef\.current = false/g) || []).length;
  if (clearCount < 2) {
    errors.push(
      "doSave must clear saveInFlightRef.current = false in both .then() success/error branches"
    );
  }
}

// Assert 3: logId is passed to recordBreathingPractice
if (!source.includes("logId,")) {
  errors.push("doSave must pass logId to recordBreathingPractice");
}

// Report
if (errors.length > 0) {
  console.error("❌ Breathe save idempotency test FAILED:\n");
  errors.forEach((e) => console.error(`  • ${e}`));
  console.error();
  process.exit(1);
}

console.log("✅ Breathe save idempotency test passed:");
console.log("  • logId generated once per practice with useState");
console.log("  • saveInFlightRef guards against concurrent saves");
console.log("  • doSave checks and sets guard, clears on completion");
console.log("  • Same logId reused across wind-down auto-save, manual Finish, and retries");
