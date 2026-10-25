#!/usr/bin/env tsx
/**
 * Source assertion: swapExercise must call canSwapExercise guard before any update
 * 
 * AST-based verification that:
 * 1. canSwapExercise is called with createSupabaseSwapGuardDeps(supabase) and input.sessionExerciseId
 * 2. The call comes before any .update( or .from("session_exercises") write
 * 3. It's followed by if (!<result>.allowed) return ...
 * 
 * Comments and dead code don't satisfy the assertion.
 */
import { readFileSync } from "fs";
import { join } from "path";
import * as ts from "typescript";

const file = join(process.cwd(), "src/app/session/actions.ts");
const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
const fail = (m: string) => { console.log(`  ✗ FAIL ${m}`); process.exit(1); };

// Find swapExercise function
const fn = sf.statements.find(
  (s): s is ts.FunctionDeclaration => 
    ts.isFunctionDeclaration(s) && s.name?.text === "swapExercise",
);
if (!fn?.body) fail("swapExercise function not found");

// Track positions of key elements
let guardCallPos = -1;
let guardResultName = "";
let guardCheckPos = -1;
let firstWritePos = -1;

// Find the guard call: await canSwapExercise(createSupabaseSwapGuardDeps(supabase), input.sessionExerciseId)
const findGuardCall = (n: ts.Node): void => {
  // Look for: const <result> = await canSwapExercise(...)
  if (ts.isVariableStatement(n)) {
    for (const decl of n.declarationList.declarations) {
      if (ts.isVariableDeclaration(decl) && decl.initializer && ts.isAwaitExpression(decl.initializer)) {
        const awaitedExpr = decl.initializer.expression;
        if (ts.isCallExpression(awaitedExpr) && 
            awaitedExpr.expression.getText(sf) === "canSwapExercise" &&
            awaitedExpr.arguments.length === 2) {
          const arg0 = awaitedExpr.arguments[0].getText(sf);
          const arg1 = awaitedExpr.arguments[1].getText(sf);
          if (arg0.includes("createSupabaseSwapGuardDeps") && arg0.includes("supabase") &&
              arg1 === "input.sessionExerciseId") {
            guardCallPos = n.pos;
            guardResultName = decl.name.getText(sf);
          }
        }
      }
    }
  }
  
  if (!ts.isFunctionLike(n) || n === fn) ts.forEachChild(n, findGuardCall);
};

// Find if (!<result>.allowed) return ...
const findGuardCheck = (n: ts.Node): void => {
  if (ts.isIfStatement(n) && ts.isPrefixUnaryExpression(n.expression) && 
      n.expression.operator === ts.SyntaxKind.ExclamationToken) {
    const operand = n.expression.operand;
    if (ts.isPropertyAccessExpression(operand) && 
        operand.expression.getText(sf) === guardResultName &&
        operand.name.text === "allowed") {
      // Check that the body has a return statement
      const body = n.thenStatement;
      const hasReturn = body.getText(sf).includes("return");
      if (hasReturn && guardCheckPos === -1) {
        guardCheckPos = n.pos;
      }
    }
  }
  
  if (!ts.isFunctionLike(n) || n === fn) ts.forEachChild(n, findGuardCheck);
};

// Find first write operation (.update( or .from("session_exercises"))
const findFirstWrite = (n: ts.Node): void => {
  if (ts.isCallExpression(n)) {
    // Look for .update( or .from("session_exercises")
    if ((ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "update") ||
        (n.expression.getText(sf).endsWith(".from") && 
         n.arguments.length > 0 && 
         n.arguments[0].getText(sf).includes("session_exercises"))) {
      if (firstWritePos === -1) {
        firstWritePos = n.pos;
      }
    }
  }
  
  if (!ts.isFunctionLike(n) || n === fn) ts.forEachChild(n, findFirstWrite);
};

findGuardCall(fn!.body!);
findGuardCheck(fn!.body!);
findFirstWrite(fn!.body!);

// Validate findings
if (guardCallPos === -1) {
  fail("swapExercise must call await canSwapExercise(createSupabaseSwapGuardDeps(supabase), input.sessionExerciseId)");
}

if (!guardResultName) {
  fail("canSwapExercise result must be stored in a variable");
}

if (guardCheckPos === -1) {
  fail(`swapExercise must check if (!${guardResultName}.allowed) return ...`);
}

if (guardCheckPos <= guardCallPos) {
  fail("guard check must come after guard call");
}

if (firstWritePos !== -1 && guardCallPos >= firstWritePos) {
  fail("canSwapExercise guard must be called before any .update( or .from(\"session_exercises\") write");
}

console.log("  ✓ swapExercise calls canSwapExercise(createSupabaseSwapGuardDeps(supabase), input.sessionExerciseId)");
console.log(`  ✓ guard call comes before any write operation`);
console.log(`  ✓ guard is followed by if (!${guardResultName}.allowed) return ...`);
console.log("\n✅ All swap exercise guard source assertions passed");
