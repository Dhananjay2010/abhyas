#!/usr/bin/env tsx
// PROPOSED (QA Bot 3, not committed): AST-scoped A1 assertion. Comments are not nodes, so a
// commented-out call can't satisfy it; the call must be a direct element of the Promise.all
// array awaited inside `if (existing) { ... }` of startSession.
import { readFileSync } from "fs";
import { join } from "path";
import ts from "typescript";

const file = join(process.cwd(), "src/app/session/actions.ts");
const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
const fail = (m: string) => { console.log(`  ✗ FAIL ${m}`); process.exit(1); };

const fn = sf.statements.find(
  (s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === "startSession",
);
if (!fn?.body) fail("startSession not found");

let branch: ts.Block | undefined;
const findIf = (n: ts.Node): void => {
  if (!branch && ts.isIfStatement(n) && n.expression.getText(sf) === "existing" && ts.isBlock(n.thenStatement)) branch = n.thenStatement;
  ts.forEachChild(n, findIf);
};
findIf(fn!.body!);
if (!branch) fail("`if (existing) { ... }` branch not found in startSession");

let ok = false;
const visit = (n: ts.Node): void => {
  if (ts.isArrayLiteralExpression(n) && ts.isCallExpression(n.parent) && n.parent.expression.getText(sf) === "Promise.all" && ts.isAwaitExpression(n.parent.parent)) {
    for (const el of n.elements) {
      if (ts.isCallExpression(el) && el.expression.getText(sf) === "ensureSessionExercises" &&
          el.arguments.map((a) => a.getText(sf)).join(",") === "supabase,user.id,existing.id") ok = true;
    }
  }
  if (!ts.isFunctionLike(n)) ts.forEachChild(n, visit); // don't descend into nested closures
};
visit(branch!);
if (!ok) fail("A1: the existing-session branch must await Promise.all([... ensureSessionExercises(supabase, user.id, existing.id) ...])");
console.log("  ✓ A1: existing-session branch awaits ensureSessionExercises(supabase, user.id, existing.id)");
