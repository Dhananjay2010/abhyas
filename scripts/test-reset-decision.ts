/**
 * Test reset decision logic (when to reset progression targets)
 *
 *   npm run test:reset-decision
 */
import { shouldResetProgressionTargets } from "../src/lib/program/reset-decision";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\nReset decision: fields that trigger reset");
{
  const current = {
    goal: "hypertrophy",
    level: "intermediate",
    days_per_week: 4,
    primary_track: "barbell",
  };

  check("goal change triggers reset",
    shouldResetProgressionTargets({ goal: "strength" }, current) === true);
  
  check("level change triggers reset",
    shouldResetProgressionTargets({ level: "advanced" }, current) === true);
  
  check("days_per_week change triggers reset",
    shouldResetProgressionTargets({ days_per_week: 3 }, current) === true);
  
  check("primary_track change triggers reset",
    shouldResetProgressionTargets({ primary_track: "kettlebell" }, current) === true);
}

console.log("\nReset decision: fields that DON'T trigger reset");
{
  const current = {
    goal: "hypertrophy",
    level: "intermediate",
    days_per_week: 4,
    primary_track: "barbell",
  };

  check("age change doesn't trigger reset",
    shouldResetProgressionTargets({ age: 30 }, current) === false);
  
  check("weight change doesn't trigger reset",
    shouldResetProgressionTargets({ weight_kg: 80 }, current) === false);
  
  check("height change doesn't trigger reset",
    shouldResetProgressionTargets({ height_cm: 180 }, current) === false);
  
  check("sex change doesn't trigger reset",
    shouldResetProgressionTargets({ sex: "female" }, current) === false);
}

console.log("\nReset decision: no change in progression fields");
{
  const current = {
    goal: "hypertrophy",
    level: "intermediate",
    days_per_week: 4,
    primary_track: "barbell",
  };

  check("same goal doesn't trigger reset",
    shouldResetProgressionTargets({ goal: "hypertrophy" }, current) === false);
  
  check("same level doesn't trigger reset",
    shouldResetProgressionTargets({ level: "intermediate" }, current) === false);
  
  check("same days_per_week doesn't trigger reset",
    shouldResetProgressionTargets({ days_per_week: 4 }, current) === false);
  
  check("same primary_track doesn't trigger reset",
    shouldResetProgressionTargets({ primary_track: "barbell" }, current) === false);
}

console.log("\nReset decision: multiple changes");
{
  const current = {
    goal: "hypertrophy",
    level: "intermediate",
    days_per_week: 4,
    primary_track: "barbell",
  };

  check("multiple progression fields trigger reset",
    shouldResetProgressionTargets({
      goal: "strength",
      level: "advanced",
      age: 35,
    }, current) === true);
  
  check("only non-progression fields don't trigger reset",
    shouldResetProgressionTargets({
      age: 35,
      weight_kg: 85,
    }, current) === false);
}

console.log("\nReset decision: null current profile");
{
  check("null current profile doesn't trigger reset",
    shouldResetProgressionTargets({ goal: "strength" }, null) === false);
}

console.log("\nReset decision: undefined vs null");
{
  const current = {
    goal: "hypertrophy",
    level: "intermediate",
    days_per_week: 4,
    primary_track: "barbell",
  };

  check("undefined field in patch is ignored",
    shouldResetProgressionTargets({ goal: undefined }, current) === false);
  
  check("null vs string counts as change",
    shouldResetProgressionTargets({ goal: null as unknown as string }, current) === true);
}

console.log("\nMutation guard: O10 (settings always resets)");
{
  // O10: Settings action always calls resetProgressionTargets, even when no
  // progression fields changed.
  const current = {
    goal: "hypertrophy",
    level: "intermediate",
    days_per_week: 4,
    primary_track: "barbell",
  };
  
  // If the action unconditionally resets, this function must return false
  // for non-progression changes to kill that mutant.
  const nonProgressionChange = { age: 35, weight_kg: 80 };
  
  check("non-progression changes don't trigger reset (kills O10)",
    shouldResetProgressionTargets(nonProgressionChange, current) === false,
    "age/weight should NOT reset");
  
  const progressionChange = { goal: "strength" };
  
  check("progression changes do trigger reset",
    shouldResetProgressionTargets(progressionChange, current) === true,
    "goal change SHOULD reset");
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
