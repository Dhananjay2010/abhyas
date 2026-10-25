#!/usr/bin/env tsx
// A1 assertion: ensureSessionExercises must be called in the existing-session branch.
// After refactoring, this logic moved from actions.ts to start-session-full-core.ts.
import { readFileSync } from "fs";
import { join } from "path";
import ts from "typescript";

const file = join(process.cwd(), "src/lib/session/start-session-full-core.ts");
const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
const fail = (m: string) => { console.log(`  ✗ FAIL ${m}`); process.exit(1); };

const fn = sf.statements.find(
  (s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === "startSessionFullCore",
);
if (!fn?.body) fail("startSessionFullCore not found");

let branch: ts.Block | undefined;
const findIf = (n: ts.Node): void => {
  if (!branch && ts.isIfStatement(n) && n.expression.getText(sf) === "existing" && ts.isBlock(n.thenStatement)) branch = n.thenStatement;
  ts.forEachChild(n, findIf);
};
findIf(fn!.body!);
if (!branch) fail("`if (existing) { ... }` branch not found in startSessionFullCore");

let ok = false;
const visit = (n: ts.Node): void => {
  if (ts.isArrayLiteralExpression(n) && ts.isCallExpression(n.parent) && n.parent.expression.getText(sf) === "Promise.all" && ts.isAwaitExpression(n.parent.parent)) {
    for (const el of n.elements) {
      if (ts.isCallExpression(el) && el.expression.getText(sf) === "deps.ensureSessionExercises" &&
          el.arguments.map((a) => a.getText(sf)).join(",") === "existing.id") ok = true;
    }
  }
  if (!ts.isFunctionLike(n)) ts.forEachChild(n, visit);
};
visit(branch!);
if (!ok) fail("A1: the existing-session branch must await Promise.all([... deps.ensureSessionExercises(existing.id) ...])");
console.log("  ✓ A1: existing-session branch awaits Promise.all with deps.ensureSessionExercises(existing.id)");
