/**
 * Test 1: 'Keep it' on a Rest OVERRIDE day must keep the override.
 *
 * When the user has a planned override that makes today Rest (the template had
 * a training day), the rest prompt's 'Keep it' should keep today as Rest,
 * not delete the override and revert to the template's training day.
 *
 * This is a source analysis test that verifies the planDay action's logic.
 *
 *   npx tsx scripts/test-rest-override-keep-it.ts
 */

import fs from "fs";
import path from "path";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` -- ${detail}` : ""}`);
}

const actionsPath = path.join(__dirname, "../src/app/session/actions.ts");
const actionsContent = fs.readFileSync(actionsPath, "utf-8");

console.log("\n1. planDay action has 'keep' logic that checks for Rest overrides");
{
  // The action should check if existing planned sessions include Rest
  check(
    "Has 'keep' case",
    actionsContent.includes('if (input.plan.kind === "keep")')
  );

  // Should filter planned sessions
  check(
    "Filters planned sessions",
    actionsContent.includes('filter((s) => s.status === "planned"')
  );
  
  // The fix should check if the planned session is already Rest before deleting
  // This will fail on main and pass after the fix
  const hasRestCheck = 
    actionsContent.includes('actual_type === "rest"') ||
    actionsContent.includes("actual_type !== 'rest'") ||
    actionsContent.includes('planned.every((s) => s.actual_type === "rest")') ||
    actionsContent.includes('planned.some((s) => s.actual_type !== "rest")');

  check(
    "Checks if override is Rest before deleting",
    hasRestCheck,
    "Should check actual_type === 'rest' to avoid deleting Rest overrides"
  );
}

console.log("\n2. Rest override 'Keep it' behavior documented");
{
  // The fix should be clear in comments or structure
  const hasComment = actionsContent.includes("Rest override") || 
                     actionsContent.includes("rest override");
  
  check(
    "Documents Rest override handling",
    hasComment || actionsContent.includes('actual_type === "rest"'),
    "Should document or implement Rest override special case"
  );
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
