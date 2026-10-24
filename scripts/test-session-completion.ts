/**
 * Test sessionCompletion helper logic and elapsed timer logic.
 *
 * Validates:
 * - Complete sessions (all sets logged, not ended early)
 * - Partial sessions (ended early with some sets)
 * - Edge cases (0/10, more logged than planned, negative inputs)
 * - elapsedSeconds: pure elapsed calculation
 * - freezeElapsed: pure freeze helper
 * - Freeze logic: frozen value doesn't change, second stop returns same value
 *
 *   npx tsx scripts/test-session-completion.ts
 */

import { sessionCompletion } from "../src/lib/session/completion";
import { elapsedSeconds, freezeElapsed } from "../src/lib/session/device";

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

console.log("\n9. elapsedSeconds: basic calculation");
{
  const start = 1000000;
  const now = 1060000;
  const result = elapsedSeconds(start, now);
  check("60 seconds elapsed", result === 60, String(result));
}

console.log("\n10. elapsedSeconds: clamped at 0 for negative");
{
  const start = 1000000;
  const now = 999000;
  const result = elapsedSeconds(start, now);
  check("negative clamped to 0", result === 0, String(result));
}

console.log("\n11. elapsedSeconds: fractional seconds are floored");
{
  const start = 1000000;
  const now = 1002500;
  const result = elapsedSeconds(start, now);
  check("2.5 seconds floored to 2", result === 2, String(result));
}

console.log("\n12. Freeze logic: frozen value doesn't change as time advances");
{
  const start = 1000000;
  const frozenAt = 1060000;
  const later = 1120000;
  const frozenValue = elapsedSeconds(start, frozenAt);
  const laterValue = elapsedSeconds(start, later);
  check("frozen at 60s", frozenValue === 60, String(frozenValue));
  check("later would be 120s", laterValue === 120, String(laterValue));
  check("frozen value unchanged", frozenValue === 60, String(frozenValue));
}

console.log("\n13. Freeze logic: multiple stops return same value");
{
  const start = 1000000;
  const stopTime = 1045000;
  const firstStop = elapsedSeconds(start, stopTime);
  const secondStop = elapsedSeconds(start, stopTime);
  check("first stop = 45s", firstStop === 45, String(firstStop));
  check("second stop = 45s", secondStop === 45, String(secondStop));
  check("values match", firstStop === secondStop, `${firstStop} === ${secondStop}`);
}

console.log("\n14. Resume logic: after freeze, time continues from frozen point");
{
  const start = 1000000;
  const freezeAt = 1030000;
  const laterAt = 1070000;

  const frozenValue = elapsedSeconds(start, freezeAt);
  const resumedValue = elapsedSeconds(start, laterAt);

  check("frozen at 30s", frozenValue === 30, String(frozenValue));
  check("after resume continues to 70s", resumedValue === 70, String(resumedValue));
}

console.log("\n15. freezeElapsed: returns frozen value when set");
{
  const result = freezeElapsed(60, 0, 999000);
  check("returns 60 (frozen)", result === 60, String(result));
}

console.log("\n16. freezeElapsed: calculates elapsed when frozen is null");
{
  const result = freezeElapsed(null, 0, 45000);
  check("returns 45 (calculated)", result === 45, String(result));
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
