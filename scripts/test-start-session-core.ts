#!/usr/bin/env tsx
/*
 * Test: startSessionCore 23505 handling
 *
 * Tests that startSessionCore handles Postgres unique constraint violation (23505)
 * by re-reading the existing in_progress session and returning its id.
 */

import { startSessionCore, type StartSessionClient } from "../src/lib/session/start-session-core";

export {}; // Make this a module

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
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

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log("Testing startSessionCore 23505 handling\n");

  // Test 1: Insert succeeds
  await test("Insert succeeds → return session id", async () => {
    const client = {
      from(table: "sessions") {
        return {
          insert(payload: unknown) {
            return {
              select(cols: string) {
                return {
                  single() {
                    return Promise.resolve({
                      data: { id: "session-123" },
                      error: null,
                    });
                  },
                };
              },
            };
          },
          select() {
            throw new Error("Should not call select alone");
          },
        };
      },
    } as StartSessionClient;

    const result = await startSessionCore(client, "user-1", {
      user_id: "user-1",
      program_day_id: "day-1",
      local_date: "2026-10-24",
      status: "in_progress",
    });

    assert(result.ok === true, "Should succeed");
    if (result.ok) {
      assert(result.sessionId === "session-123", "Should return correct session id");
    }
  });

  // Test 2: 23505 race, re-read succeeds
  await test("23505 race → re-read existing session", async () => {
    const client = {
      from(table: "sessions") {
        return {
          insert(payload: unknown) {
            return {
              select(cols: string) {
                return {
                  single() {
                    return Promise.resolve({
                      data: null,
                      error: { code: "23505", message: "duplicate key value violates unique constraint" },
                    });
                  },
                };
              },
            };
          },
          select(columns: string) {
            return {
              eq(col: string, val: unknown) {
                assert(col === "user_id", "Should filter by user_id");
                assert(val === "user-1", "Should use correct user id");
                return {
                  eq(col2: string, val2: unknown) {
                    assert(col2 === "status", "Should filter by status");
                    assert(val2 === "in_progress", "Should filter in_progress");
                    return {
                      order(col3: string, opts: { ascending: boolean }) {
                        assert(col3 === "created_at", "Should order by created_at");
                        assert(opts.ascending === false, "Should order descending");
                        return {
                          limit(n: number) {
                            assert(n === 1, "Should limit to 1");
                            return {
                              maybeSingle() {
                                return Promise.resolve({
                                  data: { id: "existing-session-456" },
                                  error: null,
                                });
                              },
                            };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };

    const result = await startSessionCore(client, "user-1", {
      user_id: "user-1",
      program_day_id: "day-1",
      local_date: "2026-10-24",
      status: "in_progress",
    });

    assert(result.ok === true, "Should succeed after re-read");
    if (result.ok) {
      assert(
        result.sessionId === "existing-session-456",
        `Expected existing-session-456, got ${result.sessionId}`,
      );
    }
  });

  // Test 3: 23505 race, re-read fails (no session found)
  await test("23505 race, re-read fails → error", async () => {
    const client = {
      from(table: "sessions") {
        return {
          insert(payload: unknown) {
            return Promise.resolve({
              data: null,
              error: { code: "23505", message: "duplicate key value violates unique constraint" },
            });
          },
          select(columns: string) {
            return {
              eq(col: string, val: unknown) {
                return {
                  eq(col2: string, val2: unknown) {
                    return {
                      order(col3: string, opts: { ascending: boolean }) {
                        return {
                          limit(n: number) {
                            return {
                              maybeSingle() {
                                return Promise.resolve({
                                  data: null,
                                  error: null,
                                });
                              },
                            };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };

    const result = await startSessionCore(client, "user-1", {
      user_id: "user-1",
      program_day_id: "day-1",
      local_date: "2026-10-24",
      status: "in_progress",
    });

    assert(result.ok === false, "Should fail when re-read returns null");
    if (!result.ok) {
      assert(result.error.includes("duplicate key"), "Should return original error");
    }
  });

  // Test 4: Generic database error
  await test("Generic database error → error", async () => {
    const client = {
      from(table: "sessions") {
        return {
          insert(payload: unknown) {
            return {
              select(cols: string) {
                return {
                  single() {
                    return Promise.resolve({
                      data: null,
                      error: { message: "Network error" },
                    });
                  },
                };
              },
            };
          },
          select() {
            throw new Error("Should not call select alone");
          },
        };
      },
    } as StartSessionClient;

    const result = await startSessionCore(client, "user-1", {
      user_id: "user-1",
      program_day_id: "day-1",
      local_date: "2026-10-24",
      status: "in_progress",
    });

    assert(result.ok === false, "Should fail");
    if (!result.ok) {
      assert(result.error === "Network error", `Expected 'Network error', got '${result.error}'`);
    }
  });

  // Summary
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
