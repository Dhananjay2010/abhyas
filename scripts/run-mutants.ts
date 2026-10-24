/**
 * Mutation testing runner
 * For each mutant: save original, apply mutation, run tests, record result, restore
 */
import { execSync } from "child_process";
import * as fs from "fs";

type MutantResult = {
  name: string;
  file: string;
  line: number;
  status: "KILLED" | "SURVIVED" | "SKIP";
  failingTest: string;
};

const results: MutantResult[] = [];

function runMutant(
  name: string,
  file: string,
  originalLine: string,
  mutatedLine: string
): void {
  console.log(`\nTesting mutant: ${name}`);
  console.log(`  File: ${file}`);
  
  // Read original
  const original = fs.readFileSync(file, "utf8");
  const backup = original;
  
  // Apply mutation
  if (!original.includes(originalLine)) {
    console.log(`  SKIP: Original line not found`);
    console.log(`  Looking for: ${originalLine.substring(0, 60)}...`);
    results.push({
      name,
      file,
      line: 0,
      status: "SKIP",
      failingTest: "Original line not found in file",
    });
    return;
  }
  
  const mutated = original.replace(originalLine, mutatedLine);
  fs.writeFileSync(file, mutated);
  
  try {
    // Run tests
    execSync("npm test", { stdio: "pipe", encoding: "utf8" });
    console.log(`  ❌ SURVIVED (tests still passed)`);
    results.push({
      name,
      file,
      line: 0,
      status: "SURVIVED",
      failingTest: "Tests passed with mutation active",
    });
  } catch (error) {
    const output = (error as {stdout?: string; stderr?: string}).stdout || "";
    const failLine = output.split("\n").find((l) => l.includes("FAIL")) || "Test failed";
    console.log(`  ✅ KILLED`);
    console.log(`  Failing: ${failLine.substring(0, 80)}`);
    results.push({
      name,
      file,
      line: 0,
      status: "KILLED",
      failingTest: failLine.substring(0, 100),
    });
  } finally {
    // Restore original
    fs.writeFileSync(file, backup);
  }
}

console.log("=".repeat(60));
console.log("MUTATION TESTING");
console.log("=".repeat(60));

// Mutant 1: Form key without exerciseId
runMutant(
  "form-key-no-exerciseId",
  "src/lib/session/form-key.ts",
  "  return `${sessionExerciseId}:${exerciseId}:${setNumber}`;",
  "  return `${sessionExerciseId}:${setNumber}`;"
);

// Mutant 2: Swap reads old exercise progress
runMutant(
  "swap-old-progress-O1",
  "src/app/session/actions.ts",
  "        .eq(\"exercise_id\", input.newExerciseId)",
  "        .eq(\"exercise_id\", current.exercise_id)"
);

// Mutant 3: Swap ignores daily_menu mode
runMutant(
  "swap-ignores-daily-menu-O2",
  "src/app/session/actions.ts",
  '  const remembersWeights = settingsRes.data?.planning_mode !== "daily_menu";',
  '  const remembersWeights = true;'
);

// Mutant 4: Swap ignores deload
runMutant(
  "swap-ignores-deload-O3",
  "src/app/session/actions.ts",
  "  const isDeload = !!(sessionRes.data as unknown as { sessions?: { is_deload: boolean } })",
  "  const isDeload = false; //"
);

// Mutant 5: Today ignores progressed target
runMutant(
  "today-ignores-progressed",
  "src/app/today/page.tsx",
  "            progressedTarget: progress?.current_target_reps,",
  "            progressedTarget: null,"
);

// Mutant 6: Runner doesn't apply effectiveRepsMax
runMutant(
  "runner-no-effectiveRepsMax",
  "src/app/session/[id]/session-runner.tsx",
  "                                    repsMax: effectiveMax,",
  "                                    repsMax: swapped.repsMax ?? current.repsMax,"
);

// Mutant 7: KB 32 holds instead of progressing to 36
runMutant(
  "kb-32-holds",
  "src/lib/program/progression.ts",
  "    const atKettlebellTop = hasKettlebell && from >= 48 && next === 48;",
  "    const atKettlebellTop = hasKettlebell && from >= 32 && next >= 32;"
);

// Mutant 8: KB backs off to wrong bell
runMutant(
  "kb-backoff-wrong-bell",
  "src/lib/program/progression.ts",
  "    if (KETTLEBELL_SIZES[i] < from) return KETTLEBELL_SIZES[i];",
  "    if (KETTLEBELL_SIZES[i] <= from * 0.85) return KETTLEBELL_SIZES[i];"
);

// Mutant 9: Non-standard 17 doesn't snap to 18
runMutant(
  "kb-17-no-snap",
  "src/lib/program/progression.ts",
  "      const nextBell = nextKettlebellAbove(from);",
  "      const nextBell = from + 2.5; //"
);

// Mutant 10: Non-standard 40 doesn't snap to 44
runMutant(
  "kb-40-no-snap",
  "src/lib/program/progression.ts",
  "      if (nextBell === null || nextBell === from) {",
  "      if (nextBell === null || nextBell === from || from > 35) {"
);

console.log("\n" + "=".repeat(60));
console.log("RESULTS");
console.log("=".repeat(60));
console.log();
console.log("| Mutant | File | Status | Failing Test |");
console.log("|--------|------|--------|--------------|");
for (const r of results) {
  const fileShort = r.file.replace("src/", "").replace("scripts/", "");
  const statusIcon = r.status === "KILLED" ? "✅" : r.status === "SURVIVED" ? "❌" : "⚠️";
  const test = r.failingTest.substring(0, 40);
  console.log(`| ${r.name} | ${fileShort} | ${statusIcon} ${r.status} | ${test} |`);
}

const survived = results.filter((r) => r.status === "SURVIVED").length;
const killed = results.filter((r) => r.status === "KILLED").length;

console.log();
console.log(`Killed: ${killed}, Survived: ${survived}, Total: ${results.length}`);

if (survived > 0) {
  console.log("\n⚠️  WARNING: Some mutants survived!");
  process.exit(1);
} else {
  console.log("\n✅ All mutants killed!");
}
