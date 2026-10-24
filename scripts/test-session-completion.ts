/**
 * Test sessionCompletion helper logic and endedEarlyFromRows.
 *
 * Validates:
 * - Complete sessions (all sets logged, not ended early)
 * - Partial sessions (ended early with some sets)
 * - Edge cases (0/10, more logged than planned, negative inputs)
 * - endedEarlyFromRows: derive ended_early from status and exercise statuses
 *
 *   npx tsx scripts/test-session-completion.ts
 */

import { sessionCompletion, endedEarlyFromRows, type ExerciseStatus } from "../src/lib/session/completion";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Complete session (all sets logged, not ended early)");
{
  const result = sessionCompletion({
    loggedSets: 10,
    plannedSets: 10,
    endedEarly: false,
  });
  check("kind is complete", result.kind === "complete", result.kind);
  check("label is Complete", result.label === "Complete", result.label);
}

console.log("\n2. Ended early with some sets logged");
{
  const result = sessionCompletion({
    loggedSets: 2,
    plannedSets: 10,
    endedEarly: true,
  });
  check("kind is partial", result.kind === "partial", result.kind);
  check(
    "label shows ended early",
    result.label === "Ended early · 2/10 sets",
    result.label,
  );
}

console.log("\n3. Ended early with zero sets");
{
  const result = sessionCompletion({
    loggedSets: 0,
    plannedSets: 10,
    endedEarly: true,
  });
  check("kind is partial", result.kind === "partial", result.kind);
  check(
    "label shows 0/10",
    result.label === "Ended early · 0/10 sets",
    result.label,
  );
}

console.log("\n4. More sets logged than planned (not ended early)");
{
  const result = sessionCompletion({
    loggedSets: 12,
    plannedSets: 10,
    endedEarly: false,
  });
  check("kind is complete", result.kind === "complete", result.kind);
  check("label is Complete", result.label === "Complete", result.label);
}

console.log("\n5. Fewer sets than planned but not ended early");
{
  const result = sessionCompletion({
    loggedSets: 8,
    plannedSets: 10,
    endedEarly: false,
  });
  check("kind is partial", result.kind === "partial", result.kind);
  check("label shows 8/10", result.label === "8/10 sets", result.label);
}

console.log("\n6. Zero planned sets (edge case)");
{
  const result = sessionCompletion({
    loggedSets: 0,
    plannedSets: 0,
    endedEarly: false,
  });
  check("kind is complete", result.kind === "complete", result.kind);
}

console.log("\n7. Ended early with all sets logged");
{
  const result = sessionCompletion({
    loggedSets: 10,
    plannedSets: 10,
    endedEarly: true,
  });
  check("kind is partial", result.kind === "partial", result.kind);
  check(
    "label still shows ended early",
    result.label === "Ended early · 10/10 sets",
    result.label,
  );
}

console.log("\n8. Negative inputs are clamped to zero");
{
  const result = sessionCompletion({
    loggedSets: -5,
    plannedSets: 10,
    endedEarly: false,
  });
  check("negative loggedSets clamped", result.label === "0/10 sets", result.label);
  
  const result2 = sessionCompletion({
    loggedSets: 5,
    plannedSets: -10,
    endedEarly: false,
  });
  check("negative plannedSets clamped", result2.kind === "complete", result2.kind);
}

console.log("\n9. endedEarlyFromRows: completed with pending exercise");
{
  const statuses: ExerciseStatus[] = ["completed", "completed", "pending"];
  const result = endedEarlyFromRows("completed", statuses);
  check("completed + pending exercise = true", result === true, String(result));
}

console.log("\n10. endedEarlyFromRows: completed with all completed");
{
  const statuses: ExerciseStatus[] = ["completed", "completed", "completed"];
  const result = endedEarlyFromRows("completed", statuses);
  check("completed + all completed = false", result === false, String(result));
}

console.log("\n11. endedEarlyFromRows: completed with all skipped");
{
  const statuses: ExerciseStatus[] = ["skipped", "skipped"];
  const result = endedEarlyFromRows("completed", statuses);
  check("completed + all skipped = false", result === false, String(result));
}

console.log("\n12. endedEarlyFromRows: in_progress is false");
{
  const statuses: ExerciseStatus[] = ["completed", "pending"];
  const result = endedEarlyFromRows("in_progress", statuses);
  check("in_progress status = false", result === false, String(result));
}

console.log("\n13. endedEarlyFromRows: skipped status is false");
{
  const statuses: ExerciseStatus[] = ["skipped"];
  const result = endedEarlyFromRows("skipped", statuses);
  check("skipped status = false", result === false, String(result));
}

console.log("\n14. endedEarlyFromRows: mix of completed and skipped with one pending");
{
  const statuses: ExerciseStatus[] = ["completed", "skipped", "pending", "completed"];
  const result = endedEarlyFromRows("completed", statuses);
  check("mix with one pending = true", result === true, String(result));
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
