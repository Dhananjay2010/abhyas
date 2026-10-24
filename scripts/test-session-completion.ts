/**
 * Test sessionCompletion helper logic.
 *
 * Validates:
 * - Complete sessions (all sets logged, not ended early)
 * - Partial sessions (ended early with some sets)
 * - Edge cases (0/10, more logged than planned, etc.)
 *
 *   npx tsx scripts/test-session-completion.ts
 */

import { sessionCompletion } from "../src/lib/session/completion";

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

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
