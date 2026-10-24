#!/usr/bin/env tsx
/*
 * Test: logSetCore with recording fake client
 *
 * Tests the extracted core logic with a recording fake Supabase client
 * that asserts insert (not upsert), is_warmup_set filter, and 23505 handling.
 */

import { logSetCore } from "../src/lib/session/log-set-core";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

export {}; // Make this a module

type SessionSet = {
  session_exercise_id: string;
  user_id: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
  is_warmup_set: boolean;
  completed_at: string;
};

type CallRecord = {
  method: string;
  table?: string;
  payload?: unknown;
  filters?: Record<string, unknown>;
};


// Fake client type that matches what logSetCore needs from SupabaseClient
type FakeSupabaseClientForLogSet = Pick<SupabaseClient<Database>, 'from'>;

/**
 * Recording fake Supabase client that tracks all method calls.
 * Supports "race mode" where the initial lookup returns null but insert returns 23505.
 */
function createRecordingFakeClient(initialSets: SessionSet[], options?: { raceMode?: boolean; racedSet?: SessionSet }): FakeSupabaseClientForLogSet {
  const sets = new Map<string, SessionSet>(
    initialSets.map((s) => [`${s.session_exercise_id}:${s.set_number}:${s.is_warmup_set}`, { ...s }]),
  );
  const calls: CallRecord[] = [];
  let insertCallCount = 0;

  return {
    from: (table: string) => {
      calls.push({ method: "from", table });
      return {
        select: (columns: string) => {
          calls.push({ method: "select", table, payload: columns });
          return {
            eq: (col: string, val: unknown) => {
              const methods = {
                eq: (col2: string, val2: unknown) => {
                  const nestedMethods = {
                    eq: (col3: string, val3: unknown) => ({
                      maybeSingle: async () => {
                        calls.push({
                          method: "maybeSingle",
                          table,
                          filters: { [col]: val, [col2]: val2, [col3]: val3 },
                        });
                        const key = `${val}:${val2}:${val3}`;
                        
                        // Race mode: first lookup (before insert) returns null
                        if (options?.raceMode && insertCallCount === 0) {
                          return { data: null, error: null };
                        }
                        
                        const set = sets.get(key);
                        return { data: set || null, error: null };
                      },
                    }),
                    order: (orderCol: string) => {
                      calls.push({
                        method: "order",
                        table,
                        filters: { [col]: val, [col2]: val2 },
                        payload: orderCol,
                      });
                      const matching = Array.from(sets.values()).filter(
                        (s) => s.session_exercise_id === val && s.is_warmup_set === val2,
                      );
                      return Promise.resolve({ data: matching, error: null });
                    },
                  };
                  return nestedMethods;
                },
              };
              return methods;
            },
          };
        },
        insert: async (payload: SessionSet | SessionSet[]) => {
          calls.push({ method: "insert", table, payload });
          insertCallCount++;
          const rows = Array.isArray(payload) ? payload : [payload];
          
          // Race mode: inject the raced set and return 23505
          if (options?.raceMode && options.racedSet && insertCallCount === 1) {
            const key = `${options.racedSet.session_exercise_id}:${options.racedSet.set_number}:${options.racedSet.is_warmup_set}`;
            sets.set(key, options.racedSet);
            return { data: null, error: { code: "23505", message: "duplicate key violates unique constraint" } };
          }
          
          for (const row of rows) {
            const key = `${row.session_exercise_id}:${row.set_number}:${row.is_warmup_set}`;
            if (sets.has(key)) {
              // Simulate Postgres unique constraint violation
              return { data: null, error: { code: "23505", message: "duplicate key" } };
            }
            sets.set(key, { ...row });
          }
          return { data: rows, error: null };
        },
        upsert: async (payload: unknown) => {
          calls.push({ method: "upsert", table, payload });
          return { data: null, error: { message: "upsert called (forbidden)" } };
        },
      };
    },
    getCalls: () => calls,
    wasUpsertCalled: () => calls.some((c) => c.method === "upsert"),
    wasInsertCalled: () => calls.some((c) => c.method === "insert"),
    getFilterCalls: () =>
      calls.filter((c) => c.method === "maybeSingle" || c.method === "order").map((c) => c.filters),
  };
}

let passed = 0;
let failed = 0;

function testLogSetCore(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`✗ ${name}`);
      console.error(`  ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  })();
}

function assertEqualCore<T>(actual: T, expected: T, msg: string = "") {
  if (actual !== expected) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${msg ? `: ${msg}` : ""}`,
    );
  }
}

function assertTrue(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(msg);
  }
}

async function main() {
  console.log("Testing logSetCore with recording fake client\n");

  // Test 1: Mutant (a) - insert is called, not upsert
  await testLogSetCore("Insert is called, not upsert", async () => {
    const fake = createRecordingFakeClient([]);
    await logSetCore(fake, "user-1", {
      sessionExerciseId: "ex-1",
      setNumber: 1,
      reps: 10,
      weightKg: 60,
      durationSeconds: null,
    });

    assertEqualCore(fake.wasUpsertCalled(), false, "Upsert should never be called");
    assertEqualCore(fake.wasInsertCalled(), true, "Insert should be called");
  });

  // Test 2: Mutant (d) - is_warmup_set: false filter is applied on lookup
  await testLogSetCore("is_warmup_set: false filter on existing set lookup", async () => {
    const fake = createRecordingFakeClient([
      {
        session_exercise_id: "ex-2",
        user_id: "user-1",
        set_number: 1,
        reps: 5,
        weight_kg: 40,
        duration_seconds: null,
        is_warmup_set: true,
        completed_at: "2026-10-24T12:00:00Z",
      },
    ]);

    await logSetCore(fake, "user-1", {
      sessionExerciseId: "ex-2",
      setNumber: 1,
      reps: 10,
      weightKg: 60,
      durationSeconds: null,
    });

    const filterCalls = fake.getFilterCalls();
    const lookupFilter = filterCalls.find(
      (f) => f && f.session_exercise_id === "ex-2" && f.set_number === 1,
    );
    assertTrue(!!lookupFilter, "Should have a lookup with session_exercise_id and set_number");
    assertEqualCore(lookupFilter!.is_warmup_set, false, "Should filter on is_warmup_set: false");
  });

  // Test 3: Mutant (e) - 23505 handling re-reads and returns conflict
  await testLogSetCore("23505 race: re-read and return conflict", async () => {
    // Simulate race: initial lookup finds nothing, insert returns 23505, re-read finds different values
    const racedSet = {
      session_exercise_id: "ex-3",
      user_id: "user-1",
      set_number: 1,
      reps: 12,
      weight_kg: 65,
      duration_seconds: null,
      is_warmup_set: false,
      completed_at: "2026-10-24T12:00:00Z",
    };

    const fake = createRecordingFakeClient([], { raceMode: true, racedSet });

    const result = await logSetCore(fake, "user-1", {
      sessionExerciseId: "ex-3",
      setNumber: 1,
      reps: 10,
      weightKg: 60,
      durationSeconds: null,
    });

    assertEqualCore(result.ok, false, "Should return conflict");
    assertTrue(!result.ok && "reason" in result, "Result must have reason field");
    // Type assertion: after assertTrue, we know result has these fields
    const conflictResult = result as Extract<typeof result, { reason: "set_exists" }>;
    assertEqualCore(conflictResult.reason, "set_exists", "Should have set_exists reason");
    assertTrue("savedSets" in conflictResult && Array.isArray(conflictResult.savedSets), "Result must have savedSets array");
    assertTrue(conflictResult.savedSets.length > 0, "Should have at least one saved set");
    assertEqualCore(conflictResult.savedSets[0].reps, 12, "Should return raced set's reps");
    assertEqualCore(conflictResult.savedSets[0].weightKg, 65, "Should return raced set's weight");
  });

  // Test 4: 23505 race with identical values returns duplicate_ok
  await testLogSetCore("23505 race: re-read identical values → duplicate_ok", async () => {
    // Simulate race: initial lookup finds nothing, insert returns 23505, re-read finds identical values
    const racedSet = {
      session_exercise_id: "ex-4",
      user_id: "user-1",
      set_number: 1,
      reps: 10,
      weight_kg: 60,
      duration_seconds: null,
      is_warmup_set: false,
      completed_at: "2026-10-24T12:00:00Z",
    };

    const fake = createRecordingFakeClient([], { raceMode: true, racedSet });

    const result = await logSetCore(fake, "user-1", {
      sessionExerciseId: "ex-4",
      setNumber: 1,
      reps: 10,
      weightKg: 60,
      durationSeconds: null,
    });

    assertEqualCore(result.ok, true, "Should return success for identical values");
  });

  // Test 5: Existing set with different values returns conflict
  await testLogSetCore("Existing set with different values → conflict", async () => {
    const fake = createRecordingFakeClient([
      {
        session_exercise_id: "ex-5",
        user_id: "user-1",
        set_number: 1,
        reps: 12,
        weight_kg: 30,
        duration_seconds: null,
        is_warmup_set: false,
        completed_at: "2026-10-24T12:00:00Z",
      },
    ]);

    const result = await logSetCore(fake, "user-1", {
      sessionExerciseId: "ex-5",
      setNumber: 1,
      reps: 15,
      weightKg: 35,
      durationSeconds: null,
    });

    assertEqualCore(result.ok, false, "Should return conflict");
    assertTrue(!result.ok && "reason" in result, "Result must have reason field");
    // Type assertion: after assertTrue, we know result has these fields
    const conflictResult = result as Extract<typeof result, { reason: "set_exists" }>;
    assertEqualCore(conflictResult.reason, "set_exists", "Should have set_exists reason");
    assertTrue("savedSets" in conflictResult && Array.isArray(conflictResult.savedSets), "Result must have savedSets array");
    assertEqualCore(conflictResult.savedSets.length, 1, "Should return 1 saved set");
    assertEqualCore(conflictResult.savedSets[0].reps, 12, "Should return existing reps");
    assertEqualCore(conflictResult.savedSets[0].weightKg, 30, "Should return existing weight");
  });

  // Test 6: No existing set → insert succeeds
  await testLogSetCore("No existing set → insert succeeds", async () => {
    const fake = createRecordingFakeClient([]);

    const result = await logSetCore(fake, "user-1", {
      sessionExerciseId: "ex-6",
      setNumber: 1,
      reps: 10,
      weightKg: 60,
      durationSeconds: null,
    });

    assertEqualCore(result.ok, true, "Should succeed");
    assertEqualCore(fake.wasInsertCalled(), true, "Insert should be called");
    assertEqualCore(fake.wasUpsertCalled(), false, "Upsert should never be called");
  });

  // Test 7: Two-tab scenario - stale tab logs set 2 after fresh tab already saved it
  await testLogSetCore("Two tabs: stale tab tries to log set 2 after fresh tab saved it", async () => {
    // Simulate: fresh tab already saved set 2 with 12 reps @ 65kg
    const existingSet = {
      session_exercise_id: "ex-7",
      user_id: "user-1",
      set_number: 2,
      reps: 12,
      weight_kg: 65,
      duration_seconds: null,
      is_warmup_set: false,
      completed_at: "2026-10-24T12:00:00Z",
    };

    // Stale tab doesn't know about this row (initial lookup returns null because it has stale cache),
    // but insert will hit unique constraint (23505) because the row exists
    const fake = createRecordingFakeClient([], { raceMode: true, racedSet: existingSet });

    // Stale tab tries to log set 2 with different values: 10 reps @ 60kg
    const result = await logSetCore(fake, "user-1", {
      sessionExerciseId: "ex-7",
      setNumber: 2,
      reps: 10,
      weightKg: 60,
      durationSeconds: null,
    });

    // Should return conflict with the existing row
    assertEqualCore(result.ok, false, "Should return conflict");
    assertTrue(!result.ok && "reason" in result, "Result must have reason field");
    const conflictResult = result as Extract<typeof result, { reason: "set_exists" }>;
    assertEqualCore(conflictResult.reason, "set_exists", "Should have set_exists reason");
    assertTrue("savedSets" in conflictResult && Array.isArray(conflictResult.savedSets), "Result must have savedSets array");
    assertTrue(conflictResult.savedSets.length > 0, "Should have at least one saved set");
    
    // Should return the existing row from the fresh tab, unchanged
    assertEqualCore(conflictResult.savedSets[0].setNumber, 2, "Should return set number 2");
    assertEqualCore(conflictResult.savedSets[0].reps, 12, "Should return existing 12 reps from fresh tab");
    assertEqualCore(conflictResult.savedSets[0].weightKg, 65, "Should return existing 65kg from fresh tab");
    
    // Existing row should be unchanged (not overwritten by stale tab)
    const calls = fake.getCalls();
    const insertCall = calls.find((c) => c.method === "insert");
    assertTrue(insertCall !== undefined, "Insert should have been called");
    
    // The 23505 error prevents the stale tab's values from being written
    assertEqualCore(fake.wasUpsertCalled(), false, "Upsert should never be called");
  });

  // Summary
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
