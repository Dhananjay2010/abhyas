import { isSessionEndedEarly } from "../src/lib/today/session-ended-early";

let failures = 0;

function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
}

console.log("\nTesting isSessionEndedEarly pure function\n");

// Test 1: Completed session with pending exercises → ended early
console.log("1. Completed session with pending exercises returns true");
{
  const session = { status: "completed" };
  const exercises = [
    { status: "completed" },
    { status: "pending" },
    { status: "pending" },
  ];
  const result = isSessionEndedEarly(session, exercises);
  check("Returns true when completed with pending exercises", result === true);
}

// Test 2: Completed session with all exercises done → not ended early
console.log("\n2. Completed session with all exercises done returns false");
{
  const session = { status: "completed" };
  const exercises = [
    { status: "completed" },
    { status: "completed" },
    { status: "skipped" },
  ];
  const result = isSessionEndedEarly(session, exercises);
  check("Returns false when all exercises completed or skipped", result === false);
}

// Test 3: In-progress session with pending exercises → not ended early
console.log("\n3. In-progress session returns false");
{
  const session = { status: "in_progress" };
  const exercises = [
    { status: "completed" },
    { status: "pending" },
  ];
  const result = isSessionEndedEarly(session, exercises);
  check("Returns false for in_progress session", result === false);
}

// Test 4: Null session → not ended early
console.log("\n4. Null session returns false");
{
  const result = isSessionEndedEarly(null, [{ status: "pending" }]);
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

// Test 7: Empty exercises array → not ended early
console.log("\n7. Empty exercises array returns false");
{
  const session = { status: "completed" };
  const exercises: Array<{ status: string }> = [];
  const result = isSessionEndedEarly(session, exercises);
  check("Returns false with empty exercises array", result === false);
}

// Test 8: Completed with only pending exercises → ended early
console.log("\n8. Completed with only pending exercises returns true");
{
  const session = { status: "completed" };
  const exercises = [
    { status: "pending" },
    { status: "pending" },
  ];
  const result = isSessionEndedEarly(session, exercises);
  check("Returns true when all exercises are pending", result === true);
}

// Test 9: Planned session → not ended early
console.log("\n9. Planned session returns false");
{
  const session = { status: "planned" };
  const exercises = [
    { status: "pending" },
  ];
  const result = isSessionEndedEarly(session, exercises);
  check("Returns false for planned session", result === false);
}

// Test 10: Skipped session → not ended early
console.log("\n10. Skipped session returns false");
{
  const session = { status: "skipped" };
  const exercises = [
    { status: "pending" },
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
