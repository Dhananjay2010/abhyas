#!/usr/bin/env tsx
/*
 * Test: updateSessionCore 23505 handling
 *
 * Tests that updateSessionCore handles Postgres unique constraint violation (23505)
 * when updating a skipped session to in_progress, by re-reading the existing
 * in_progress session for that user/date and returning its id.
 */

import { updateSessionCore, type UpdateSessionClient } from "../src/lib/session/update-session-core";

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
  console.log("Testing updateSessionCore 23505 handling\n");

  // Test 1: Update succeeds
  await test("Update succeeds → return same session id", async () => {
    const client = {
      from(table: "sessions") {
        return {
          update(payload: unknown) {
            return {
              eq(col: string, val: unknown) {
                assert(col === "id", "Should filter by id");
                assert(val === "session-123", "Should use correct session id");
                return Promise.resolve({
                  error: null,
                });
              },
            };
          },
          select() {
            throw new Error("Should not call select on success");
          },
        };
      },
    } as UpdateSessionClient;

    const result = await updateSessionCore(
      client,
      "session-123",
      "user-1",
      "2026-10-24",
      { status: "in_progress" },
    );

    assert(result.ok === true, "Should succeed");
    if (result.ok) {
      assert(result.sessionId === "session-123", "Should return same session id");
    }
  });

  // Test 2: 23505 race, re-read existing in_progress session
  await test("23505 race → re-read existing in_progress session", async () => {
    const client = {
      from(table: "sessions") {
        return {
          update(payload: unknown) {
            return {
              eq(col: string, val: unknown) {
                return Promise.resolve({
                  error: { code: "23505", message: "duplicate key value violates unique constraint" },
                });
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
                    assert(col2 === "local_date", "Should filter by local_date");
                    assert(val2 === "2026-10-24", "Should use correct local date");
                    return {
                      eq(col3: string, val3: unknown) {
                        assert(col3 === "status", "Should filter by status");
                        assert(val3 === "in_progress", "Should filter in_progress");
                        return {
                          order(col4: string, opts: { ascending: boolean }) {
                            assert(col4 === "created_at", "Should order by created_at");
                            assert(opts.ascending === false, "Should order descending");
                            return {
                              limit(n: number) {
                                assert(n === 1, "Should limit to 1");
                                return {
                                  maybeSingle() {
                                    return Promise.resolve({
                                      data: { id: "other-session-789" },
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
      },
    } as UpdateSessionClient;

    const result = await updateSessionCore(
      client,
      "session-123",
      "user-1",
      "2026-10-24",
      { status: "in_progress" },
    );

    assert(result.ok === true, "Should succeed after re-read");
    if (result.ok) {
      assert(
        result.sessionId === "other-session-789",
        `Expected other-session-789, got ${result.sessionId}`,
      );
    }
  });

  // Test 3: 23505 race, re-read fails (no session found)
  await test("23505 race, re-read fails → error", async () => {
    const client = {
      from(table: "sessions") {
        return {
          update(payload: unknown) {
            return {
              eq(col: string, val: unknown) {
                return Promise.resolve({
                  error: { code: "23505", message: "duplicate key value violates unique constraint" },
                });
              },
            };
          },
          select(columns: string) {
            return {
              eq(col: string, val: unknown) {
                return {
                  eq(col2: string, val2: unknown) {
                    return {
                      eq(col3: string, val3: unknown) {
                        return {
                          order(col4: string, opts: { ascending: boolean }) {
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
      },
    } as UpdateSessionClient;

    const result = await updateSessionCore(
      client,
      "session-123",
      "user-1",
      "2026-10-24",
      { status: "in_progress" },
    );

    assert(result.ok === false, "Should fail when re-read returns null");
    if (!result.ok) {
      assert(result.error === "Could not start the session", "Should return generic error");
    }
  });

  // Test 4: Generic database error
  await test("Generic database error → error", async () => {
    const client = {
      from(table: "sessions") {
        return {
          update(payload: unknown) {
            return {
              eq(col: string, val: unknown) {
                return Promise.resolve({
                  error: { message: "Connection timeout" },
                });
              },
            };
          },
          select() {
            throw new Error("Should not call select for non-23505 errors");
          },
        };
      },
    } as UpdateSessionClient;

    const result = await updateSessionCore(
      client,
      "session-123",
      "user-1",
      "2026-10-24",
      { status: "in_progress" },
    );

    assert(result.ok === false, "Should fail");
    if (!result.ok) {
      assert(result.error === "Connection timeout", `Expected 'Connection timeout', got '${result.error}'`);
    }
  });

  // Summary
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
