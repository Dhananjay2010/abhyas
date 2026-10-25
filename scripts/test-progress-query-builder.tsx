/**
 * MEDIUM-1: Extract progress query builder and test .eq('user_id') filter.
 * 
 * The session/[id]/page.tsx builds a progress query that must filter by user_id.
 * This test extracts that builder into src/lib and tests it directly.
 */

import { buildExerciseProgressQuery, type ProgressQueryClient } from "@/lib/session/progress-query";

type Call = {
  method: "from" | "select" | "eq";
  args: unknown[];
};

class RecordingQueryBuilder {
  calls: Call[] = [];

  from(table: "exercise_progress") {
    this.calls.push({ method: "from", args: [table] });
    return this;
  }

  select(columns: "exercise_id, current_working_weight_kg, current_target_reps") {
    this.calls.push({ method: "select", args: [columns] });
    return this;
  }

  eq(column: "user_id", value: string) {
    this.calls.push({ method: "eq", args: [column, value] });
    return this;
  }
}

function createRecordingClient(): { client: ProgressQueryClient; recorder: RecordingQueryBuilder } {
  const recorder = new RecordingQueryBuilder();
  const client: ProgressQueryClient = {
    from(table: "exercise_progress") {
      return recorder.from(table);
    },
  };
  return { client, recorder };
}

const checks: Array<{ pass: boolean; name: string }> = [];
function check(name: string, pass: boolean) {
  checks.push({ pass, name });
  if (!pass) console.error(`✗ ${name}`);
}

console.log("Testing exercise progress query builder\n");

// --- Test 1: Query calls .from('exercise_progress') ---
const mock1 = createRecordingClient();
const userId = "test-user-123";
buildExerciseProgressQuery(mock1.client, userId);

check(
  "Query calls .from('exercise_progress')",
  mock1.recorder.calls.some((c) => c.method === "from" && c.args[0] === "exercise_progress")
);

// --- Test 2: Query calls .select with correct columns ---
check(
  "Query calls .select with correct columns",
  mock1.recorder.calls.some(
    (c) =>
      c.method === "select" &&
      c.args[0] === "exercise_id, current_working_weight_kg, current_target_reps"
  )
);

// --- Test 3: Query calls .eq('user_id', userId) - security filter ---
check(
  "Query calls .eq('user_id', userId) - security filter",
  mock1.recorder.calls.some((c) => c.method === "eq" && c.args[0] === "user_id" && c.args[1] === userId)
);

// --- Test 4: Different user ID is correctly applied ---
const mock2 = createRecordingClient();
const anotherUserId = "another-user-456";
buildExerciseProgressQuery(mock2.client, anotherUserId);

check(
  "Query filters by the provided user_id",
  mock2.recorder.calls.some((c) => c.method === "eq" && c.args[0] === "user_id" && c.args[1] === anotherUserId)
);

// --- Test 5: Query order is correct (from → select → eq) ---
const fromIndex = mock1.recorder.calls.findIndex((c) => c.method === "from");
const selectIndex = mock1.recorder.calls.findIndex((c) => c.method === "select");
const eqIndex = mock1.recorder.calls.findIndex((c) => c.method === "eq");

check(
  "Query order: from before select before eq",
  fromIndex >= 0 && selectIndex >= 0 && eqIndex >= 0 && fromIndex < selectIndex && selectIndex < eqIndex
);

// --- Test 6: Verify call count (should be exactly 3: from, select, eq) ---
check(
  "Query makes exactly 3 calls (from, select, eq)",
  mock1.recorder.calls.length === 3
);

// --- Summary ---
console.log("");
const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => !c.pass).length;

if (failed > 0) {
  console.error(`\n${failed} failed, ${passed} passed\n`);
  process.exit(1);
}

console.log(`${passed} passed, ${failed} failed\n`);
