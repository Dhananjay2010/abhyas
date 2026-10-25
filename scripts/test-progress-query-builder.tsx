/**
 * MEDIUM-1: Extract progress query builder and test .eq('user_id') filter.
 * 
 * The session/[id]/page.tsx builds a progress query that must filter by user_id.
 * This test extracts that builder into src/lib and tests it directly.
 */

import { buildExerciseProgressQuery } from "@/lib/session/progress-query";

// Mock Supabase client that tracks query construction
type QueryStep = {
  method: string;
  args: unknown[];
};

class MockQueryBuilder {
  steps: QueryStep[] = [];

  from(table: string) {
    this.steps.push({ method: "from", args: [table] });
    return this;
  }

  select(columns: string) {
    this.steps.push({ method: "select", args: [columns] });
    return this;
  }

  eq(column: string, value: unknown) {
    this.steps.push({ method: "eq", args: [column, value] });
    return this;
  }
}

class MockClient {
  builder = new MockQueryBuilder();

  from(table: string) {
    return this.builder.from(table);
  }
}

const checks: Array<{ pass: boolean; name: string }> = [];
function check(name: string, pass: boolean) {
  checks.push({ pass, name });
  if (!pass) console.error(`✗ ${name}`);
}

console.log("Testing exercise progress query builder\n");

// --- Test 1: Query builder includes .eq('user_id', userId) ---
const mockClient = new MockClient();
const userId = "test-user-123";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
buildExerciseProgressQuery(mockClient as any, userId);

check(
  "Query calls .from('exercise_progress')",
  mockClient.builder.steps.some((s) => s.method === "from" && s.args[0] === "exercise_progress")
);

check(
  "Query calls .select with correct columns",
  mockClient.builder.steps.some(
    (s) =>
      s.method === "select" &&
      typeof s.args[0] === "string" &&
      s.args[0].includes("exercise_id") &&
      s.args[0].includes("current_working_weight_kg") &&
      s.args[0].includes("current_target_reps")
  )
);

check(
  "Query calls .eq('user_id', userId)",
  mockClient.builder.steps.some((s) => s.method === "eq" && s.args[0] === "user_id" && s.args[1] === userId)
);

// --- Test 2: Different user ID is correctly applied ---
const mockClient2 = new MockClient();
const anotherUserId = "another-user-456";
buildExerciseProgressQuery(mockClient2, anotherUserId);

check(
  "Query filters by the provided user_id",
  mockClient2.builder.steps.some((s) => s.method === "eq" && s.args[0] === "user_id" && s.args[1] === anotherUserId)
);

// --- Test 3: Query order is correct (from → select → eq) ---
const fromIndex = mockClient.builder.steps.findIndex((s) => s.method === "from");
const selectIndex = mockClient.builder.steps.findIndex((s) => s.method === "select");
const eqIndex = mockClient.builder.steps.findIndex((s) => s.method === "eq" && s.args[0] === "user_id");

check(
  "Query order: from before select before eq",
  fromIndex < selectIndex && selectIndex < eqIndex
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
