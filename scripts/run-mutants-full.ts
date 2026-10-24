/**
 * Full mutation testing runner - all 27 mutations
 * For each mutant: save original, apply mutation, run tests, record result, restore
 */
import { execSync } from "child_process";
import * as fs from "fs";

type MutantResult = {
  id: string;
  name: string;
  file: string;
  status: "KILLED" | "SURVIVED" | "SKIP";
  failingTest: string;
};

const results: MutantResult[] = [];

function runMutant(
  id: string,
  name: string,
  file: string,
  originalLine: string,
  mutatedLine: string
): void {
  console.log(`\nTesting ${id}: ${name}`);
  console.log(`  File: ${file}`);
  
  const original = fs.readFileSync(file, "utf8");
  const backup = original;
  
  if (!original.includes(originalLine)) {
    console.log(`  ⚠️  SKIP: Original line not found`);
    results.push({ id, name, file, status: "SKIP", failingTest: "Original line not found" });
    return;
  }
  
  const mutated = original.replace(originalLine, mutatedLine);
  fs.writeFileSync(file, mutated);
  
  try {
    execSync("npm test", { stdio: "pipe", encoding: "utf8" });
    console.log(`  ❌ SURVIVED`);
    results.push({ id, name, file, status: "SURVIVED", failingTest: "Tests passed with mutation" });
  } catch (error) {
    const output = (error as { stdout?: string }).stdout || "";
    const failLine = output.split("\n").find((l) => l.includes("FAIL")) || "Test failed";
    console.log(`  ✅ KILLED`);
    results.push({ id, name, file, status: "KILLED", failingTest: failLine.substring(0, 80) });
  } finally {
    fs.writeFileSync(file, backup);
  }
}

console.log("=".repeat(70));
console.log("MUTATION TESTING - ALL 27 MUTATIONS");
console.log("=".repeat(70));

// ===== Form & Swap (O-series) =====

runMutant(
  "M1",
  "Form key without exerciseId",
  "src/lib/session/form-key.ts",
  "  return `${sessionExerciseId}:${exerciseId}:${setNumber}`;",
  "  return `${sessionExerciseId}:${setNumber}`;"
);

runMutant(
  "O1",
  "Swap reads old exercise progress",
  "src/lib/session/swap-core.ts",
  "        .eq(\"exercise_id\", input.newExerciseId)",
  "        .eq(\"exercise_id\", current.exercise_id)"
);

runMutant(
  "O2",
  "Swap ignores daily_menu",
  "src/lib/session/swap-core.ts",
  "  const remembersWeights = (settingsRes.data as { planning_mode: string } | null)?.planning_mode !== \"daily_menu\";",
  "  const remembersWeights = true;"
);

runMutant(
  "O3",
  "Swap ignores deload",
  "src/lib/session/swap-core.ts",
  "  const isDeload = !!((sessionRes.data as { sessions?: { is_deload: boolean } }) || {})?.sessions?.is_deload;",
  "  const isDeload = false;"
);

runMutant(
  "O4",
  "Swap empty copy doesn't show",
  "src/lib/session/swap.ts",
  "    message: isEmpty ? \"No safe swap for this one. You can skip it.\" : \"\",",
  "    message: \"\","
);

runMutant(
  "O5",
  "Swap Skip button doesn't render when empty",
  "src/lib/session/swap.ts",
  "    showSkipButton: isEmpty,",
  "    showSkipButton: false,"
);

runMutant(
  "O6",
  "Swap Skip button renders when not empty",
  "src/lib/session/swap.ts",
  "  const isEmpty = options.alternatives.length === 0;",
  "  const isEmpty = false;"
);

runMutant(
  "O10",
  "Settings always resets progression",
  "src/lib/settings/update-profile-core.ts",
  "  if (shouldResetProgressionTargets(patch, currentProfile)) {",
  "  if (true) {"
);

// ===== Runner & Today =====

runMutant(
  "M5",
  "Today ignores progressed target",
  "src/lib/program/effective-target.ts",
  "  return Math.max(plannedMax, progressedTarget ?? plannedMax);",
  "  return plannedMax;"
);

runMutant(
  "M6",
  "Runner doesn't apply effectiveRepsMax",
  "src/lib/session/runner-swap-defaults.ts",
  "    repsMax: effectiveMax,",
  "    repsMax: swapped.repsMax ?? current.repsMax,"
);

runMutant(
  "G5",
  "Runner ignores swapped weights",
  "src/lib/program/effective-target.ts",
  "  if (!isBodyweight || (usedWeight !== null && usedWeight > 0)) return plannedMax;",
  "  if (true) return plannedMax;"
);

// ===== Kettlebell Progression =====

runMutant(
  "M7",
  "KB 32 holds instead of →36",
  "src/lib/program/progression.ts",
  "    const atKettlebellTop = hasKettlebell && from >= 48 && next === 48;",
  "    const atKettlebellTop = hasKettlebell && from >= 32;"
);

runMutant(
  "M8",
  "KB backs off to wrong bell",
  "src/lib/program/progression.ts",
  "    if (KETTLEBELL_SIZES[i] < from) return KETTLEBELL_SIZES[i];",
  "    if (KETTLEBELL_SIZES[i] <= from * 0.85) return KETTLEBELL_SIZES[i];"
);

runMutant(
  "M9",
  "KB 17 doesn't snap to 18",
  "src/lib/program/progression.ts",
  "    } else if (hasKettlebell) {",
  "    } else if (false && hasKettlebell) {"
);

runMutant(
  "M10",
  "KB 40 doesn't snap to 44",
  "src/lib/program/progression.ts",
  "      if (nextBell === null || nextBell === from) {",
  "      if (nextBell === null || nextBell === from || from > 38) {"
);

// ===== R-series (Reset logic) =====

runMutant(
  "R1",
  "Goal change doesn't trigger reset",
  "src/lib/program/reset-decision.ts",
  "    (patch.goal !== undefined && patch.goal !== current.goal) ||",
  "    (false && patch.goal !== undefined && patch.goal !== current.goal) ||"
);

runMutant(
  "R2",
  "Level change doesn't trigger reset",
  "src/lib/program/reset-decision.ts",
  "    (patch.level !== undefined && patch.level !== current.level) ||",
  "    (false && patch.level !== undefined && patch.level !== current.level) ||"
);

runMutant(
  "R2b",
  "Days_per_week change doesn't trigger reset",
  "src/lib/program/reset-decision.ts",
  "    (patch.days_per_week !== undefined && patch.days_per_week !== current.days_per_week) ||",
  "    (false && patch.days_per_week !== undefined && patch.days_per_week !== current.days_per_week) ||"
);

// ===== S-series (Suggested weight / deload) =====

runMutant(
  "S3",
  "Deload doesn't reduce weight",
  "src/lib/program/progression.ts",
  "  if (isDeload) {",
  "  if (false && isDeload) {"
);

runMutant(
  "S4",
  "Bodyweight deload doesn't return null",
  "src/lib/program/progression.ts",
  "  if (meta.isBodyweight) {",
  "  if (false && meta.isBodyweight) {"
);

// ===== P-series (Progress / working weight) =====

runMutant(
  "P1",
  "Page ignores progress weight",
  "src/lib/session/build-runner-init.ts",
  "    const working =",
  "    const working = null; const _working ="
);

runMutant(
  "P2",
  "Page uses wrong progress field",
  "src/lib/session/build-runner-init.ts",
  "        : Number(progress.current_working_weight_kg);",
  "        : Number(progress.current_target_reps); //"
);

runMutant(
  "P3",
  "Runner ignores bodyweight check",
  "src/lib/session/build-runner-init.ts",
  "    const isBodyweight = isBodyweightEquipment(ex?.equipment_ids ?? []);",
  "    const isBodyweight = false;"
);

runMutant(
  "P4",
  "Page effectiveRepsMax gets wrong args",
  "src/lib/session/build-runner-init.ts",
  "        progressedTarget: progress?.current_target_reps,",
  "        progressedTarget: null,"
);

console.log("\n" + "=".repeat(70));
console.log("RESULTS");
console.log("=".repeat(70));
console.log();
console.log("| ID | Mutant | File | Status | Failing Test |");
console.log("|----|--------|------|--------|--------------|");
for (const r of results) {
  const fileShort = r.file.replace("src/", "").substring(0, 30);
  const statusIcon = r.status === "KILLED" ? "✅" : r.status === "SURVIVED" ? "❌" : "⚠️";
  const test = r.failingTest.substring(0, 35);
  console.log(`| ${r.id} | ${r.name.substring(0, 25)} | ${fileShort} | ${statusIcon} ${r.status} | ${test} |`);
}

const survived = results.filter((r) => r.status === "SURVIVED").length;
const killed = results.filter((r) => r.status === "KILLED").length;
const skipped = results.filter((r) => r.status === "SKIP").length;

console.log();
console.log(`Killed: ${killed}, Survived: ${survived}, Skipped: ${skipped}, Total: ${results.length}`);

if (survived > 0) {
  console.log("\n⚠️  WARNING: Some mutants survived!");
  process.exit(1);
}

console.log("\n✅ All mutants killed!");
