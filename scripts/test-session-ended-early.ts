import { isSessionEndedEarly } from "../src/lib/today/session-ended-early";

let failures = 0;

function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
}

console.log("\nTesting isSessionEndedEarly pure function\n");

// Test 1: Completed session with fewer logged sets than planned → ended early
console.log("1. Completed session with fewer logged sets returns true");
{
  const session = { status: "completed" };
  const exercises = [
    { planned_sets: 3, session_sets: [{ is_warmup_set: false, reps: 10, duration_seconds: null }, { is_warmup_set: false, reps: 10, duration_seconds: null }] },
    { planned_sets: 3, session_sets: [] },
  ];
  const result = isSessionEndedEarly(session, exercises);
  check("Returns true when logged sets (2) < planned sets (6)", result === true);
}

// Test 2: Completed session with all sets logged → not ended early
console.log("\n2. Completed session with all planned sets returns false");
{
  const session = { status: "completed" };
  const exercises = [
    { planned_sets: 3, session_sets: [{ is_warmup_set: false, reps: 10, duration_seconds: null }, { is_warmup_set: false, reps: 10, duration_seconds: null }, { is_warmup_set: false, reps: 10, duration_seconds: null }] },
    { planned_sets: 2, session_sets: [{ is_warmup_set: false, reps: 10, duration_seconds: null }, { is_warmup_set: false, reps: 10, duration_seconds: null }] },
  ];
  const result = isSessionEndedEarly(session, exercises);
  check("Returns false when all planned sets logged", result === false);
}

// Test 3: In-progress session → not ended early
console.log("\n3. In-progress session returns false");
{
  const session = { status: "in_progress" };
  const exercises = [
    { planned_sets: 3, session_sets: [{ is_warmup_set: false, reps: 10, duration_seconds: null }] },
  ];
  const result = isSessionEndedEarly(session, exercises);
  check("Returns false for in_progress session", result === false);
}

// Test 4: Null session → not ended early
console.log("\n4. Null session returns false");
{
  const result = isSessionEndedEarly(null, [{ planned_sets: 3, session_sets: [] }]);
  check("Returns false when session is null", result === false);
}

// Test 5: Null exercises → not ended early
console.log("\n5. Null exercises returns false");
{
  const session = { status: "completed" };
  const result = isSessionEndedEarly(session, null);
  check("Returns false when exercises is null", result === false);
}

// Test 6: Null session and exercises → not ended early
console.log("\n6. Both null returns false");
{
  const result = isSessionEndedEarly(null, null);
  check("Returns false when both are null", result === false);
}

// Test 7: Empty exercises array → not ended early (0 logged of 0 planned)
console.log("\n7. Empty exercises array returns false");
{
  const session = { status: "completed" };
  const exercises: Array<{ planned_sets: number; session_sets: Array<{ is_warmup_set: boolean; reps: number | null; duration_seconds: number | null }> }> = [];
  const result = isSessionEndedEarly(session, exercises);
  check("Returns false with empty exercises array", result === false);
}

// Test 8: Completed with warmup-only sets → ended early
console.log("\n8. Completed with warmup-only sets returns true (0 working sets < planned)");
{
  const session = { status: "completed" };
  const exercises = [
    { planned_sets: 3, session_sets: [{ is_warmup_set: true, reps: 5, duration_seconds: null }] },
  ];
  const result = isSessionEndedEarly(session, exercises);
  check("Returns true when only warmup sets logged", result === true);
}

// Test 9: Planned session → not ended early
console.log("\n9. Planned session returns false");
{
  const session = { status: "planned" };
  const exercises = [
    { planned_sets: 3, session_sets: [] },
  ];
  const result = isSessionEndedEarly(session, exercises);
  check("Returns false for planned session", result === false);
}

// Test 10: Skipped session → not ended early
console.log("\n10. Skipped session returns false");
{
  const session = { status: "skipped" };
  const exercises = [
    { planned_sets: 3, session_sets: [] },
  ];
  const result = isSessionEndedEarly(session, exercises);
  check("Returns false for skipped session", result === false);
}

console.log("");
if (failures > 0) {
  console.log(`❌ FAIL: ${failures} checks failed`);
  process.exit(1);
}
console.log("✨ All session-ended-early tests passed!");
