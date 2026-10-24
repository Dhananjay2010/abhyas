/**
 * Real mutant testing (Item 5).
 *
 * Apply source edits and run the full test suite to verify tests catch bugs.
 *
 *   npm run test:real-mutants
 */
import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";

const originalContents = new Map<string, string>();

function applyMutant(filePath: string, original: string, mutated: string): void {
  const fullPath = path.resolve(__dirname, "..", filePath);
  const content = fs.readFileSync(fullPath, "utf-8");

  if (!originalContents.has(filePath)) {
    originalContents.set(filePath, content);
  }

  const mutatedContent = content.replace(original, mutated);
  if (mutatedContent === content) {
    throw new Error(`Mutant application failed: original not found in ${filePath}`);
  }
  fs.writeFileSync(fullPath, mutatedContent, "utf-8");
}

function revertFile(filePath: string): void {
  const saved = originalContents.get(filePath);
  if (!saved) {
    throw new Error(`No saved content for ${filePath}`);
  }
  const fullPath = path.resolve(__dirname, "..", filePath);
  fs.writeFileSync(fullPath, saved, "utf-8");
}

function runTest(): { passed: boolean; output: string } {
  try {
    const output = child_process.execSync("npm test", {
      encoding: "utf-8",
      stdio: "pipe",
      cwd: path.resolve(__dirname, ".."),
      timeout: 180000, // 3 minutes
    });
    return { passed: true, output };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string };
    return { passed: false, output: err.stdout || err.stderr || String(error) };
  }
}

const mutants: Array<{
  id: string;
  desc: string;
  file: string;
  original: string;
  mutated: string;
}> = [
  {
    id: "X1",
    desc: "repoint runs on every block build, not only on rebuild",
    file: "src/lib/program/persist.ts",
    original: "if (rebuildOf) {",
    mutated: "if (true) {  // MUTANT X1: always repoint",
  },
  {
    id: "X2",
    desc: "the repoint call is removed from persist.ts",
    file: "src/lib/program/persist.ts",
    original: `  if (rebuildOf) {
    const localToday = localDateString(timezone);
    const repointResult = await repointSessionsAfterRebuild(
      supabase,
      userId,
      program.id,
      localToday,
    );`,
    mutated: `  if (false && rebuildOf) {  // MUTANT X2: repoint disabled
    const localToday = localDateString(timezone);
    const repointResult = await repointSessionsAfterRebuild(
      supabase,
      userId,
      program.id,
      localToday,
    );`,
  },
  {
    id: "X5",
    desc: "the session's program_id isn't updated",
    file: "src/lib/program/repoint-sessions.ts",
    original: "      .update({ program_day_id: r.newProgramDayId, program_id: newProgramId })",
    mutated: "      .update({ program_day_id: r.newProgramDayId })  // MUTANT X5: program_id not updated",
  },
  {
    id: "X7",
    desc: "'has logged sets' is always false",
    file: "src/lib/program/repoint-sessions.ts",
    original: `    const hasSets = sessionExercises.some(
      (se: { session_sets?: { id: string }[] }) => {
        const sets = Array.isArray(se.session_sets) ? se.session_sets : [];
        return sets.length > 0;
      },
    );`,
    mutated: `    const hasSets = false;  // MUTANT X7: always false`,
  },
  {
    id: "X8-X9",
    desc: "Today ignores the old block's days",
    file: "src/app/today/page.tsx",
    original: "const allDays = [...(days ?? []), ...(retiredDays ?? [])];",
    mutated: "const allDays = [...(days ?? [])];  // MUTANT X8-X9: no retired days",
  },
  {
    id: "X10-X15",
    desc: "deload is ignored when session exercises are created",
    file: "src/lib/session/prepare-exercises.ts",
    original: `    const dose = isDeload
      ? applyDeload({
          sets: p.target_sets ?? 3,
          repsMin: p.target_reps_min ?? 8,
          repsMax: p.target_reps_max ?? 12,
          restSeconds: p.rest_seconds ?? 75,
        })
      : {`,
    mutated: `    const dose = false  // MUTANT X10-X15: deload ignored
      ? applyDeload({
          sets: p.target_sets ?? 3,
          repsMin: p.target_reps_min ?? 8,
          repsMax: p.target_reps_max ?? 12,
          restSeconds: p.rest_seconds ?? 75,
        })
      : {`,
  },
  {
    id: "X11",
    desc: "the block start date replaces user's local today",
    file: "src/lib/program/persist.ts",
    original: "  const startedOn = rebuildOf?.started_on ?? localDateString(timezone);",
    mutated: "  const startedOn = '2026-01-01';  // MUTANT X11: hardcoded start date",
  },
  {
    id: "X16",
    desc: "the old-block day query never runs",
    file: "src/app/today/page.tsx",
    original: "if (retiredDayIds.length > 0) {",
    mutated: "if (false && retiredDayIds.length > 0) {  // MUTANT X16: query disabled",
  },
  {
    id: "NEW1",
    desc: "day_type ignored in label matching",
    file: "src/lib/program/repoint-sessions.ts",
    original: `    const labelMatch = newDays.find(
      (d) => d.label === oldSession.old_day_label && d.day_type === chosenType
    );`,
    mutated: `    const labelMatch = newDays.find(
      (d) => d.label === oldSession.old_day_label  // MUTANT NEW1: no day_type check
    );`,
  },
  {
    id: "NEW2",
    desc: "day_type ignored in day_index matching",
    file: "src/lib/program/repoint-sessions.ts",
    original: `    const indexMatch = newDays.find(
      (d) => d.day_index === oldSession.old_day_index && d.day_type === chosenType
    );`,
    mutated: `    const indexMatch = newDays.find(
      (d) => d.day_index === oldSession.old_day_index  // MUTANT NEW2: no day_type check
    );`,
  },
  {
    id: "NEW3",
    desc: "0-set in_progress session kept, not rebuilt",
    file: "src/lib/program/repoint-sessions.ts",
    original: '    .in("status", ["planned", "in_progress"])',
    mutated: '    .in("status", ["planned"])  // MUTANT NEW3: only planned sessions',
  },
  {
    id: "NEW4",
    desc: "rest and yoga program_id not updated",
    file: "src/lib/program/repoint-sessions.ts",
    original: `    if (chosenType === "rest" || chosenType === "yoga" || chosenType === "meditation") {
      toUpdateProgramOnly.push(session.id);
      continue;
    }`,
    mutated: `    if (chosenType === "rest" || chosenType === "yoga" || chosenType === "meditation") {
      continue;  // MUTANT NEW4: no program_id update
    }`,
  },
  {
    id: "NEW5",
    desc: "item 3 helper always returns override",
    file: "src/lib/program/detect-override.ts",
    original: "  if (!override) return false;",
    mutated: "  if (!override) return true;  // MUTANT NEW5: always override",
  },
];

console.log(`\n=== Real Mutant Testing (${mutants.length} mutants) ===\n`);

for (const mutant of mutants) {
  console.log(`${mutant.id}: ${mutant.desc}`);
  
  try {
    applyMutant(mutant.file, mutant.original, mutant.mutated);
    const result = runTest();
    
    if (result.passed) {
      console.log(`  ❌ SURVIVED (no test failed)\n`);
    } else {
      // Extract the last failing test from output
      const lines = result.output.split("\n");
      const failLine = lines.find(l => l.includes("FAIL") || l.includes("error") || l.includes("Error"));
      console.log(`  ✅ KILLED by: ${failLine || "test failure"}\n`);
    }
  } catch (error) {
    console.log(`  ⚠️  ERROR: ${error}\n`);
  } finally {
    revertFile(mutant.file);
  }
}

console.log("=== Mutant Testing Complete ===\n");
