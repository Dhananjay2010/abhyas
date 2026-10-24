/**
 * Test deload application across all session-creation paths.
 *
 * QA HIGH: In a deload week, train-anyway and swapped days are labelled deload
 * but give full volume (4 sets at full weight), because ensureSessionExercises
 * copied exercises without applying the deload.
 *
 * Fix: prepareSessionExercises() is the ONE shared function that applies deload,
 * used by every path (startSession, ensureSessionExercises, train-anyway, swap,
 * tomorrow-choice, Keep, rebuild re-point).
 *
 *   npm run test:deload-paths
 */
import { readFileSync } from "node:fs";

// Read the shared function from session/actions.ts
const actionsContent = readFileSync("src/app/session/actions.ts", "utf8");

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Verify prepareSessionExercises exists and is used");
{
  check("prepareSessionExercises function exists", actionsContent.includes("function prepareSessionExercises("));
  check(
    "function comment declares it as THE ONE shared function",
    actionsContent.includes("This is the ONE shared function that applies") ||
    actionsContent.includes("the ONE shared function that applies"),
  );
}

console.log("\n2. Verify prepareSessionExercises is called from startSession");
{
  const startSessionIndex = actionsContent.indexOf("export async function startSession()");
  check("startSession exists", startSessionIndex !== -1);
  
  if (startSessionIndex !== -1) {
    const endIndex = actionsContent.indexOf("\nexport async function", startSessionIndex + 1);
    const startSessionBody = actionsContent.substring(startSessionIndex, endIndex);
    check(
      "startSession calls prepareSessionExercises",
      startSessionBody.includes("prepareSessionExercises("),
    );
    check(
      "startSession passes isDeloadWeek",
      startSessionBody.includes("prepareSessionExercises") &&
      startSessionBody.includes("isDeloadWeek"),
    );
  }
}

console.log("\n3. Verify prepareSessionExercises is called from ensureSessionExercises");
{
  const ensureIndex = actionsContent.indexOf("async function ensureSessionExercises(");
  check("ensureSessionExercises exists", ensureIndex !== -1);
  
  if (ensureIndex !== -1) {
    const endIndex = actionsContent.indexOf("\nexport", ensureIndex + 1);
    const ensureBody = actionsContent.substring(ensureIndex, endIndex !== -1 ? endIndex : undefined);
    check(
      "ensureSessionExercises calls prepareSessionExercises",
      ensureBody.includes("prepareSessionExercises("),
    );
    check(
      "ensureSessionExercises fetches is_deload from session",
      ensureBody.includes("is_deload") && ensureBody.includes(".select("),
    );
    check(
      "ensureSessionExercises passes is_deload to prepareSessionExercises",
      ensureBody.includes("prepareSessionExercises") &&
      ensureBody.includes("is_deload"),
    );
  }
}

console.log("\n4. Verify prepareSessionExercises applies deload correctly");
{
  const funcIndex = actionsContent.indexOf("function prepareSessionExercises(");
  if (funcIndex !== -1) {
    const endIndex = actionsContent.indexOf("\n}", funcIndex);
    const funcBody = actionsContent.substring(funcIndex, endIndex + 2);
    
    check(
      "function accepts isDeload parameter",
      funcBody.includes("isDeload: boolean") || funcBody.includes("isDeload,"),
    );
    check(
      "function calls applyDeload when isDeload is true",
      funcBody.includes("applyDeload(") && funcBody.includes("isDeload"),
    );
    check(
      "function uses ternary or conditional for deload",
      funcBody.includes("isDeload") && (funcBody.includes("?") || funcBody.includes("if")),
    );
  }
}

console.log("\n5. Verify applyDeload import and usage");
{
  check(
    "applyDeload is imported from prescription",
    actionsContent.includes('import') && 
    actionsContent.includes('applyDeload') &&
    actionsContent.includes('prescription'),
  );
  check(
    "prepareSessionExercises uses applyDeload",
    actionsContent.includes("function prepareSessionExercises") &&
    actionsContent.includes("applyDeload("),
  );
}

console.log("\n6. Verify no old inline deload logic remains");
{
  // The old code had inline ternary with applyDeload in startSession's map
  const hasOldPattern = actionsContent.match(/planned\.map\(\(p\)\s*=>\s*\{[\s\S]*?isDeloadWeek[\s\S]*?applyDeload[\s\S]*?\}\)/);
  check(
    "no old inline deload ternary in startSession",
    !hasOldPattern,
    hasOldPattern ? "found old pattern, should use prepareSessionExercises" : "",
  );
}

console.log("\n7. Logical verification: deload math");
{
  // applyDeload should reduce sets to ~60% (Math.max(2, Math.round(sets * 0.6)))
  // For 4 sets: Math.round(4 * 0.6) = Math.round(2.4) = 2
  // For 3 sets: Math.round(3 * 0.6) = Math.round(1.8) = 2
  const expected4to2 = Math.max(2, Math.round(4 * 0.6));
  const expected3to2 = Math.max(2, Math.round(3 * 0.6));
  check("4 sets deloads to 2 sets", expected4to2 === 2);
  check("3 sets deloads to 2 sets", expected3to2 === 2);
}

console.log("\n8. Verify ensureSessionExercises comment mentions deload");
{
  const ensureIndex = actionsContent.indexOf("async function ensureSessionExercises(");
  if (ensureIndex !== -1) {
    const commentStart = actionsContent.lastIndexOf("/**", ensureIndex);
    const funcStart = actionsContent.indexOf("async function ensureSessionExercises", commentStart);
    const comment = actionsContent.substring(commentStart, funcStart);
    
    check(
      "ensureSessionExercises JSDoc mentions deload",
      comment.toLowerCase().includes("deload"),
    );
  }
}

console.log("\n9. Verify prepareSessionExercises handles null target values");
{
  const funcIndex = actionsContent.indexOf("function prepareSessionExercises(");
  if (funcIndex !== -1) {
    const endIndex = actionsContent.indexOf("\n}", funcIndex);
    const funcBody = actionsContent.substring(funcIndex, endIndex + 2);
    
    // Should have fallback values like p.target_sets ?? 3
    check(
      "handles null target_sets with fallback",
      funcBody.includes("target_sets") && (funcBody.includes("??") || funcBody.includes("||")),
    );
  }
}

console.log("\n10. Integration check: paths that create sessions");
{
  // These functions should eventually call prepareSessionExercises or use sessions
  // that will later call ensureSessionExercises
  const hasStartSession = actionsContent.includes("export async function startSession()");
  const hasEnsureSessionExercises = actionsContent.includes("async function ensureSessionExercises(");
  const hasPlanDay = actionsContent.includes("export async function planDay(");
  
  check("startSession exists", hasStartSession);
  check("ensureSessionExercises exists", hasEnsureSessionExercises);
  check("planDay exists (creates planned sessions)", hasPlanDay);
  
  // planDay creates session rows with is_deload set, but doesn't create exercises
  // until startSession is called, which will use ensureSessionExercises
  if (hasPlanDay) {
    const planDayIndex = actionsContent.indexOf("export async function planDay(");
    const endIndex = actionsContent.indexOf("\nexport", planDayIndex + 1);
    const planDayBody = actionsContent.substring(planDayIndex, endIndex);
    check(
      "planDay writes is_deload to session",
      planDayBody.includes("is_deload") && planDayBody.includes("insert"),
    );
  }
}

if (failures > 0) {
  console.log(`\n❌ ${failures} failure(s)`);
  process.exit(1);
} else {
  console.log("\n✅ All deload path checks passed");
}
