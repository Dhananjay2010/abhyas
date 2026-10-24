/**
 * Mutation testing: verify that tests catch intentional bugs.
 *
 * Each mutant is a deliberate code change that should cause a test to fail.
 * If a test passes with the mutant, it means the test didn't catch the bug.
 *
 * npm run test:mutants
 */
import * as fs from "fs";
import * as child_process from "child_process";

type MutantResult = {
  id: string;
  description: string;
  killed: boolean;
  output?: string;
};

const results: MutantResult[] = [];

function runTest(testCommand: string): { passed: boolean; output: string } {
  try {
    const output = child_process.execSync(testCommand, {
      encoding: "utf-8",
      stdio: "pipe",
      cwd: "/workspace",
    });
    return { passed: true, output };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string };
    return { passed: false, output: err.stdout || err.stderr || String(error) };
  }
}

function applyMutant(filePath: string, original: string, mutated: string): void {
  const content = fs.readFileSync(filePath, "utf-8");
  const mutatedContent = content.replace(original, mutated);
  if (mutatedContent === content) {
    throw new Error(`Mutant application failed: original not found in ${filePath}`);
  }
  fs.writeFileSync(filePath, mutatedContent, "utf-8");
}

function revertFile(filePath: string): void {
  child_process.execSync(`git checkout HEAD -- ${filePath}`, { cwd: "/workspace" });
}

console.log("\n=== Mutation Testing ===\n");

// Mutant 1: Remove label matching (should fail test:repoint-matching test 1)
{
  const id = "M1";
  const desc = "Remove label matching in matchNewDay";
  console.log(`Testing ${id}: ${desc}...`);

  try {
    applyMutant(
      "/workspace/src/lib/program/repoint-sessions.ts",
      `  // 1. Try to match by label (exact match)
  if (oldSession.old_day_label) {
    const labelMatch = newDays.find((d) => d.label === oldSession.old_day_label);
    if (labelMatch) return labelMatch;
  }`,
      `  // 1. Try to match by label (exact match) [MUTANT: disabled]
  if (false && oldSession.old_day_label) {
    const labelMatch = newDays.find((d) => d.label === oldSession.old_day_label);
    if (labelMatch) return labelMatch;
  }`,
    );

    const result = runTest("npm run test:repoint-matching");
    results.push({
      id,
      description: desc,
      killed: !result.passed,
      output: result.output.split("\n").slice(-5).join("\n"),
    });
  } finally {
    revertFile("/workspace/src/lib/program/repoint-sessions.ts");
  }
}

// Mutant 2: Remove day_index matching (should fail test:repoint-matching test 2)
{
  const id = "M2";
  const desc = "Remove day_index matching in matchNewDay";
  console.log(`Testing ${id}: ${desc}...`);

  try {
    applyMutant(
      "/workspace/src/lib/program/repoint-sessions.ts",
      `  // 2. If no label match, try day_index (same weekday)
  if (oldSession.old_day_index !== null) {
    const indexMatch = newDays.find((d) => d.day_index === oldSession.old_day_index);
    if (indexMatch) return indexMatch;
  }`,
      `  // 2. If no label match, try day_index (same weekday) [MUTANT: disabled]
  if (false && oldSession.old_day_index !== null) {
    const indexMatch = newDays.find((d) => d.day_index === oldSession.old_day_index);
    if (indexMatch) return indexMatch;
  }`,
    );

    const result = runTest("npm run test:repoint-matching");
    results.push({
      id,
      description: desc,
      killed: !result.passed,
      output: result.output.split("\n").slice(-5).join("\n"),
    });
  } finally {
    revertFile("/workspace/src/lib/program/repoint-sessions.ts");
  }
}

// Mutant 3: Remove day_type fallback (should fail test:repoint-matching test 3)
{
  const id = "M3";
  const desc = "Remove day_type fallback in matchNewDay";
  console.log(`Testing ${id}: ${desc}...`);

  try {
    applyMutant(
      "/workspace/src/lib/program/repoint-sessions.ts",
      `  // 3. If still no match, fall back to day_type (any training day)
  const typeMatch = newDays.find((d) => d.day_type === chosenType);
  return typeMatch ?? null;`,
      `  // 3. If still no match, fall back to day_type (any training day) [MUTANT: disabled]
  return null;`,
    );

    const result = runTest("npm run test:repoint-matching");
    results.push({
      id,
      description: desc,
      killed: !result.passed,
      output: result.output.split("\n").slice(-5).join("\n"),
    });
  } finally {
    revertFile("/workspace/src/lib/program/repoint-sessions.ts");
  }
}

// Mutant 4: Change has_sets check (should fail test:repoint-matching test 11)
{
  const id = "M4";
  const desc = "Invert has_sets check in decideRepointAction";
  console.log(`Testing ${id}: ${desc}...`);

  try {
    applyMutant(
      "/workspace/src/lib/program/repoint-sessions.ts",
      `  if (session.has_sets) return "keep";`,
      `  if (!session.has_sets) return "keep"; // MUTANT: inverted`,
    );

    const result = runTest("npm run test:repoint-matching");
    results.push({
      id,
      description: desc,
      killed: !result.passed,
      output: result.output.split("\n").slice(-5).join("\n"),
    });
  } finally {
    revertFile("/workspace/src/lib/program/repoint-sessions.ts");
  }
}

// Mutant 5: Change date comparison (should fail test:repoint-matching test 14)
{
  const id = "M5";
  const desc = "Change date comparison in decideRepointAction";
  console.log(`Testing ${id}: ${desc}...`);

  try {
    applyMutant(
      "/workspace/src/lib/program/repoint-sessions.ts",
      `  if (session.local_date < today) return "ignore";`,
      `  if (session.local_date > today) return "ignore"; // MUTANT: reversed`,
    );

    const result = runTest("npm run test:repoint-matching");
    results.push({
      id,
      description: desc,
      killed: !result.passed,
      output: result.output.split("\n").slice(-5).join("\n"),
    });
  } finally {
    revertFile("/workspace/src/lib/program/repoint-sessions.ts");
  }
}

// Mutant 6: Remove deload application (should fail test:prepare-session-exercises test 2)
{
  const id = "M6";
  const desc = "Remove deload application in prepareSessionExercises";
  console.log(`Testing ${id}: ${desc}...`);

  try {
    applyMutant(
      "/workspace/src/lib/session/prepare-exercises.ts",
      `  return programDayExercises.map((p) => {
    const dose = isDeload
      ? applyDeload({
          sets: p.target_sets ?? 3,
          repsMin: p.target_reps_min ?? 8,
          repsMax: p.target_reps_max ?? 12,
          restSeconds: p.rest_seconds ?? 75,
        })
      : {
          sets: p.target_sets ?? 3,
          repsMin: p.target_reps_min ?? 8,
          repsMax: p.target_reps_max ?? 12,
          restSeconds: p.rest_seconds ?? 75,
        };`,
      `  return programDayExercises.map((p) => {
    const dose = false // MUTANT: always false
      ? applyDeload({
          sets: p.target_sets ?? 3,
          repsMin: p.target_reps_min ?? 8,
          repsMax: p.target_reps_max ?? 12,
          restSeconds: p.rest_seconds ?? 75,
        })
      : {
          sets: p.target_sets ?? 3,
          repsMin: p.target_reps_min ?? 8,
          repsMax: p.target_reps_max ?? 12,
          restSeconds: p.rest_seconds ?? 75,
        };`,
    );

    const result = runTest("npm run test:prepare-session-exercises");
    results.push({
      id,
      description: desc,
      killed: !result.passed,
      output: result.output.split("\n").slice(-5).join("\n"),
    });
  } finally {
    revertFile("/workspace/src/lib/session/prepare-exercises.ts");
  }
}

// Mutant 7: Remove error check on select (should fail test:repoint-fake-client test 1)
{
  const id = "M7";
  const desc = "Remove error check on sessions select";
  console.log(`Testing ${id}: ${desc}...`);

  try {
    applyMutant(
      "/workspace/src/lib/program/repoint-sessions.ts",
      `  if (selectError) {
    console.error("repointSessionsAfterRebuild: failed to select sessions", selectError);
    return { ok: false, error: selectError.message };
  }`,
      `  if (false && selectError) { // MUTANT: disabled error check
    console.error("repointSessionsAfterRebuild: failed to select sessions", selectError);
    return { ok: false, error: selectError.message };
  }`,
    );

    const result = runTest("npm run test:repoint-fake-client");
    results.push({
      id,
      description: desc,
      killed: !result.passed,
      output: result.output.split("\n").slice(-5).join("\n"),
    });
  } finally {
    revertFile("/workspace/src/lib/program/repoint-sessions.ts");
  }
}

// Mutant 8: Remove error check on new days select (should fail test:repoint-fake-client test 2)
{
  const id = "M8";
  const desc = "Remove error check on program_days select";
  console.log(`Testing ${id}: ${desc}...`);

  try {
    applyMutant(
      "/workspace/src/lib/program/repoint-sessions.ts",
      `  if (newDaysError) {
    console.error("repointSessionsAfterRebuild: failed to select new days", newDaysError);
    return { ok: false, error: newDaysError.message };
  }`,
      `  if (false && newDaysError) { // MUTANT: disabled error check
    console.error("repointSessionsAfterRebuild: failed to select new days", newDaysError);
    return { ok: false, error: newDaysError.message };
  }`,
    );

    const result = runTest("npm run test:repoint-fake-client");
    results.push({
      id,
      description: desc,
      killed: !result.passed,
      output: result.output.split("\n").slice(-5).join("\n"),
    });
  } finally {
    revertFile("/workspace/src/lib/program/repoint-sessions.ts");
  }
}

// Mutant 9: Remove error check on updates (should fail test:repoint-fake-client test 3)
{
  const id = "M9";
  const desc = "Remove error check on update results";
  console.log(`Testing ${id}: ${desc}...`);

  try {
    applyMutant(
      "/workspace/src/lib/program/repoint-sessions.ts",
      `  const failures = updateResults.filter((r) => r.error);
  if (failures.length > 0) {
    console.error(
      "repointSessionsAfterRebuild: some updates failed",
      failures.map((f) => f.error?.message),
    );
    return { ok: false, error: \`\${failures.length} session updates failed\` };
  }`,
      `  const failures = updateResults.filter((r) => r.error);
  if (false && failures.length > 0) { // MUTANT: disabled error check
    console.error(
      "repointSessionsAfterRebuild: some updates failed",
      failures.map((f) => f.error?.message),
    );
    return { ok: false, error: \`\${failures.length} session updates failed\` };
  }`,
    );

    const result = runTest("npm run test:repoint-fake-client");
    results.push({
      id,
      description: desc,
      killed: !result.passed,
      output: result.output.split("\n").slice(-5).join("\n"),
    });
  } finally {
    revertFile("/workspace/src/lib/program/repoint-sessions.ts");
  }
}

// Print results table
console.log("\n=== Mutation Test Results ===\n");
console.log("| Mutant | Description | Killed? |");
console.log("|--------|-------------|---------|");
results.forEach((r) => {
  const status = r.killed ? "✅ KILLED" : "❌ SURVIVED";
  console.log(`| ${r.id.padEnd(6)} | ${r.description.slice(0, 50).padEnd(50)} | ${status.padEnd(7)} |`);
});

const killed = results.filter((r) => r.killed).length;
const survived = results.filter((r) => !r.killed).length;

console.log(`\nSummary: ${killed} killed, ${survived} survived`);

if (survived > 0) {
  console.log("\n❌ Some mutants survived. Tests are incomplete.");
  process.exit(1);
} else {
  console.log("\n✅ All mutants killed. Tests are effective.");
}
