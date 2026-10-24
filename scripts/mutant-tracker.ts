#!/usr/bin/env tsx
/**
 * Mutant test tracker
 * 
 * Run npm test after each mutant to verify it's killed.
 * Record results here for the final report.
 */

const mutants = [
  {
    id: "a",
    description: "planDay skips deload (removed is_deload from session insert)",
    file: "src/app/session/actions.ts",
    line: 1024,
    original: "is_deload: week !== null && week === program?.deload_week,",
    mutant: "// is_deload: week !== null && week === program?.deload_week,",
    status: "pending",
    firstFailingTest: null,
  },
  {
    id: "b",
    description: "startSession skips deload (always pass isDeload: false)",
    file: "src/lib/session/start-session.ts",
    line: 109,
    original: "validatedRows = buildSessionExerciseRows(planned, { isDeload: isDeloadWeek });",
    mutant: "validatedRows = buildSessionExerciseRows(planned, { isDeload: false });",
    status: "pending",
    firstFailingTest: null,
  },
  {
    id: "c",
    description: "is_deload missing from select in ensureSessionExercises",
    file: "src/app/session/actions.ts",
    line: 836,
    original: '.select("program_day_id, actual_type, is_deload, session_exercises(id)")',
    mutant: '.select("program_day_id, actual_type, session_exercises(id)")',
    status: "pending",
    firstFailingTest: null,
  },
  {
    id: "d",
    description: "weighted row doesn't get sets cut (loadReducible always false)",
    file: "src/lib/session/load-reducible.ts",
    line: 39,
    original: "return !isBodyweightOnly(equipmentIds) && metric === \"reps\";",
    mutant: "return false;",
    status: "pending",
    firstFailingTest: null,
  },
  {
    id: "e",
    description: "planDay writes is_deload false (hardcode false)",
    file: "src/app/session/actions.ts",
    line: 1024,
    original: "is_deload: week !== null && week === program?.deload_week,",
    mutant: "is_deload: false,",
    status: "pending",
    firstFailingTest: null,
  },
  {
    id: "f",
    description: "loadReducible always true",
    file: "src/lib/session/load-reducible.ts",
    line: 39,
    original: "return !isBodyweightOnly(equipmentIds) && metric === \"reps\";",
    mutant: "return true;",
    status: "pending",
    firstFailingTest: null,
  },
  {
    id: "g",
    description: "validation moved after insert in startSessionCore",
    file: "src/lib/session/start-session.ts",
    line: 104,
    original: "// Validate exercise targets before creating the session.",
    mutant: "// MUTANT: validation moved after insert",
    status: "pending",
    firstFailingTest: null,
  },
  {
    id: "h",
    description: "Today bypasses shared function (inline isBodyweightOnly call)",
    file: "src/app/today/page.tsx",
    line: 415,
    original: "const loadReducible = loadReducibleFor(equipmentIds, metric);",
    mutant: "const loadReducible = false; // MUTANT: bypass shared function",
    status: "pending",
    firstFailingTest: null,
  },
  {
    id: "i",
    description: "helper treats pull_up_bar as loaded (remove from BODYWEIGHT_ONLY_EQUIPMENT)",
    file: "src/lib/session/load-reducible.ts",
    line: 8,
    original: '  "pull_up_bar",',
    mutant: '  // "pull_up_bar", // MUTANT',
    status: "pending",
    firstFailingTest: null,
  },
];

console.log("\nMutant Test Tracker\n");
console.log("Run each mutant, then npm test, then record the first failing test.\n");

for (const m of mutants) {
  console.log(`${m.id}. ${m.description}`);
  console.log(`   File: ${m.file}:${m.line}`);
  console.log(`   Original: ${m.original}`);
  console.log(`   Mutant: ${m.mutant}`);
  console.log(`   Status: ${m.status}`);
  if (m.firstFailingTest) {
    console.log(`   First failing test: ${m.firstFailingTest}`);
  }
  console.log();
}

console.log("\nTo run: Apply mutant, run npm test, revert mutant, repeat.\n");
