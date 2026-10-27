#!/usr/bin/env tsx
// A1 assertion: ensureSessionExercises must be called in the existing-session branch.
// After refactoring, this logic moved from actions.ts to start-session-full-core.ts.
// O11 assertion: deps must wire ensureSessionExercises(supabase, userId, sessionId).
import { readFileSync } from "fs";
import { join } from "path";
import ts from "typescript";

const coreFile = join(process.cwd(), "src/lib/session/start-session-full-core.ts");
const depsFile = join(process.cwd(), "src/lib/session/start-session-full-deps.ts");
const coreSf = ts.createSourceFile(coreFile, readFileSync(coreFile, "utf8"), ts.ScriptTarget.Latest, true);
const depsSf = ts.createSourceFile(depsFile, readFileSync(depsFile, "utf8"), ts.ScriptTarget.Latest, true);
const fail = (m: string) => { console.log(`  ✗ FAIL ${m}`); process.exit(1); };

// Check A1: core calls deps.ensureSessionExercises in existing-session branch
const fn = coreSf.statements.find(
  (s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === "startSessionFullCore",
);
if (!fn?.body) fail("startSessionFullCore not found");

let branch: ts.Block | undefined;
const findIf = (n: ts.Node): void => {
  if (!branch && ts.isIfStatement(n) && n.expression.getText(coreSf) === "existing" && ts.isBlock(n.thenStatement)) branch = n.thenStatement;
  ts.forEachChild(n, findIf);
};
findIf(fn!.body!);
if (!branch) fail("`if (existing) { ... }` branch not found in startSessionFullCore");

let ok = false;
const visit = (n: ts.Node): void => {
  if (ts.isArrayLiteralExpression(n) && ts.isCallExpression(n.parent) && n.parent.expression.getText(coreSf) === "Promise.all" && ts.isAwaitExpression(n.parent.parent)) {
    for (const el of n.elements) {
      if (ts.isCallExpression(el) && el.expression.getText(coreSf) === "deps.ensureSessionExercises" &&
          el.arguments.map((a) => a.getText(coreSf)).join(",") === "existing.id") ok = true;
    }
  }
  if (!ts.isFunctionLike(n)) ts.forEachChild(n, visit);
};
visit(branch!);
if (!ok) fail("A1: the existing-session branch must await Promise.all([... deps.ensureSessionExercises(existing.id) ...])");
console.log("  ✓ A1: existing-session branch awaits Promise.all with deps.ensureSessionExercises(existing.id)");

// Check O11: deps wire ensureSessionExercises
const buildFnO11 = depsSf.statements.find(
  (s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === "buildStartSessionFullDeps",
);
if (buildFnO11 && buildFnO11.body) {
  let foundEnsure = false;
  const visitDeps = (n: ts.Node): void => {
    if ((ts.isMethodDeclaration(n) || ts.isPropertyAssignment(n)) && 
        ts.isIdentifier(n.name) && n.name.text === "ensureSessionExercises") {
      foundEnsure = true;
    }
    ts.forEachChild(n, visitDeps);
  };
  visitDeps(buildFnO11.body);
  if (!foundEnsure) fail("O11: deps.ensureSessionExercises must be wired");
  console.log("  ✓ O11: deps.ensureSessionExercises is wired");
} else {
  fail("buildStartSessionFullDeps not found");
}
