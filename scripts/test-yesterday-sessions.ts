/**
 * Test yesterday-sessions helper: error path and warm-up mapping.
 * 
 * Covers:
 * - a2-helper: warm-ups excluded from working set count
 * - s4: errored read returns null (unknown state), not 0 working sets
 */

import { attachWorkingSetCounts } from "../src/lib/today/yesterday-sessions";

const sessions = [
  { id: "s1", status: "completed", actual_type: "weights", program_id: "p1" },
  { id: "s2", status: "completed", actual_type: "weights", program_id: "p1" },
];

// Test 1: successful query with working sets
const successResult = attachWorkingSetCounts(
  {
    data: [
      {
        session_id: "s1",
        session_sets: [
          { is_warmup_set: true, reps: 5, duration_seconds: null },
          { is_warmup_set: false, reps: 8, duration_seconds: null },
          { is_warmup_set: false, reps: 8, duration_seconds: null },
        ],
      },
      {
        session_id: "s2",
        session_sets: [
          { is_warmup_set: false, reps: 10, duration_seconds: null },
        ],
      },
    ],
    error: null,
  },
  sessions
);

if (!successResult) throw new Error("Expected non-null result for successful query");
if (successResult.length !== 2) throw new Error("Expected 2 sessions");

const s1 = successResult.find((s) => s.id === "s1");
const s2 = successResult.find((s) => s.id === "s2");

if (!s1 || !s2) throw new Error("Sessions not found");

// a2-helper: warm-ups must be excluded (s1 has 2 working sets, not 3)
if (s1.working_set_count !== 2) {
  throw new Error(`s1: expected 2 working sets (warm-ups excluded), got ${s1.working_set_count}`);
}

if (s2.working_set_count !== 1) {
  throw new Error(`s2: expected 1 working set, got ${s2.working_set_count}`);
}

// Test 2: session with no exercises (0 working sets)
const emptyResult = attachWorkingSetCounts(
  {
    data: [],
    error: null,
  },
  sessions
);

if (!emptyResult) throw new Error("Expected non-null result for empty data");
if (emptyResult.length !== 2) throw new Error("Expected 2 sessions");

const s1Empty = emptyResult.find((s) => s.id === "s1");
if (!s1Empty || s1Empty.working_set_count !== 0) {
  throw new Error("Expected 0 working sets for session with no exercises");
}

// Test 3: s4 - errored query returns null (unknown state)
const errorResult = attachWorkingSetCounts(
  {
    data: null,
    error: new Error("Database connection failed"),
  },
  sessions
);

if (errorResult !== null) {
  throw new Error("s4: errored query must return null (unknown state), not default to 0");
}

console.log("✓ Test 1: warm-ups excluded from working set count (a2-helper)");
console.log("✓ Test 2: sessions with no exercises get 0 working sets");
console.log("✓ Test 3: errored read returns null, not 0 (s4)");
