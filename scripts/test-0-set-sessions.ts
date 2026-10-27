/**
 * Test abandon and finish session with 0 working sets.
 *
 * Validates:
 * - All exercises skipped with 0 working sets → skipped
 * - Warm-up sets only → skipped
 * - At least one working set → completed
 *
 *   npx tsx scripts/test-0-set-sessions.ts
 */

import { decideAbandonStatus } from "../src/lib/session/abandon-session";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. All exercises skipped (no sets at all) → skipped");
{
  const exercises = [
    { session_sets: [] },
    { session_sets: [] },
    { session_sets: [] },
  ];
  const result = decideAbandonStatus(exercises);
  check("status is skipped", result === "skipped", result);
}

console.log("\n2. Warm-up sets only (no working sets) → skipped");
{
  const exercises = [
    {
      session_sets: [
        { id: "1", is_warmup_set: true },
        { id: "2", is_warmup_set: true },
      ],
    },
    {
      session_sets: [
        { id: "3", is_warmup_set: true },
      ],
    },
  ];
  const result = decideAbandonStatus(exercises);
  check("status is skipped", result === "skipped", result);
}

console.log("\n3. Mix of warm-up and working sets → completed");
{
  const exercises = [
    {
      session_sets: [
        { id: "1", is_warmup_set: true },
        { id: "2", is_warmup_set: false },
      ],
    },
  ];
  const result = decideAbandonStatus(exercises);
  check("status is completed", result === "completed", result);
}

console.log("\n4. Single working set → completed");
{
  const exercises = [
    {
      session_sets: [
        { id: "1", is_warmup_set: false },
      ],
    },
  ];
  const result = decideAbandonStatus(exercises);
  check("status is completed", result === "completed", result);
}

console.log("\n5. Multiple working sets → completed");
{
  const exercises = [
    {
      session_sets: [
        { id: "1", is_warmup_set: false },
        { id: "2", is_warmup_set: false },
        { id: "3", is_warmup_set: false },
      ],
    },
    {
      session_sets: [
        { id: "4", is_warmup_set: false },
      ],
    },
  ];
  const result = decideAbandonStatus(exercises);
  check("status is completed", result === "completed", result);
}

console.log("\n6. Empty exercises array → skipped");
{
  const exercises: { session_sets: { id: string; is_warmup_set: boolean }[] }[] = [];
  const result = decideAbandonStatus(exercises);
  check("status is skipped", result === "skipped", result);
}

console.log("\n7. Null session_sets → skipped");
{
  const exercises = [
    { session_sets: null },
    { session_sets: null },
  ];
  const result = decideAbandonStatus(exercises);
  check("status is skipped", result === "skipped", result);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
