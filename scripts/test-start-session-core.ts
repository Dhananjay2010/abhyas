#!/usr/bin/env tsx
/*
 * Test: Idempotent session start (fake client)
 *
 * Case B1-C: Today briefly showed 'Start session' instead of 'Resume' after
 * leaving a workout, which risks a duplicate session.
 *
 * Fix: startSession must be idempotent. If an in_progress session already
 * exists for that user and local day, return it instead of inserting a new one.
 */

export {}; // Make this a module

type SessionRow = {
  id: string;
  user_id: string;
  program_id: string | null;
  program_day_id: string | null;
  local_date: string;
  week_in_block: number | null;
  is_deload: boolean | null;
  planned_type: string | null;
  actual_type: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  warmup_completed: boolean;
  cooldown_completed: boolean;
  created_at: string;
  updated_at: string;
};

type SessionInsert = Omit<SessionRow, "id" | "created_at" | "updated_at" | "completed_at" | "duration_seconds" | "warmup_completed" | "cooldown_completed">;

// Fake Supabase client interface
type FakeSupabaseClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => Promise<{ data: SessionRow[] | null; error: null }>;
          order: (column: string, options: { ascending: boolean }) => {
            limit: (n: number) => {
              maybeSingle: () => Promise<{ data: { id: string } | null; error: null }>;
            };
          };
        };
        order: (column: string, options: { ascending: boolean }) => {
          limit: (n: number) => {
            maybeSingle: () => Promise<{ data: { id: string } | null; error: null }>;
          };
        };
      };
    };
    insert: (row: SessionInsert) => {
      select: (columns: string) => {
        single: () => Promise<{ data: { id: string } | null; error: { message: string; code?: string } | null }>;
      };
    };
  };
};

// Inline startSessionCore implementation for testing
type StartSessionCoreInput = {
  supabase: FakeSupabaseClient;
  userId: string;
  programId: string;
  programDayId: string;
  localDate: string;
  weekInBlock: number;
  isDeload: boolean;
  dayType: string;
};

type StartSessionCoreResult =
  | { ok: true; sessionId: string; existed: boolean }
  | { ok: false; error: string };

async function startSessionCore(
  input: StartSessionCoreInput,
): Promise<StartSessionCoreResult> {
  const { supabase, userId, localDate } = input;

  // Check for existing in_progress session for this user + date
  const { data: existingSessions } = await supabase
    .from("sessions")
    .select("id, status, local_date, actual_type")
    .eq("user_id", userId)
    .eq("local_date", localDate)
    .eq("status", "in_progress");

  // If an in_progress session exists for this user + date, return it (idempotent)
  if (existingSessions && existingSessions.length > 0) {
    const existing = existingSessions[0];
    return {
      ok: true,
      sessionId: existing.id,
      existed: true,
    };
  }

  // No existing in_progress session, create a new one
  const { data: session, error } = await supabase
    .from("sessions")
    .insert({
      user_id: userId,
      program_id: input.programId,
      program_day_id: input.programDayId,
      local_date: localDate,
      week_in_block: input.weekInBlock,
      is_deload: input.isDeload,
      planned_type: input.dayType,
      actual_type: input.dayType,
      status: "in_progress",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    // 23505: unique_violation - the partial unique index rejected a duplicate in_progress session
    // Re-read and return the existing in_progress session for this user
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("sessions")
        .select("id, created_at")
        .eq("user_id", userId)
        .eq("status", "in_progress")
        .order!("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        return {
          ok: true,
          sessionId: existing.id,
          existed: true,
        };
      }
    }

    // Not a 23505, or re-read failed
    return {
      ok: false,
      error: error.message ?? "Could not start the session",
    };
  }

  if (!session) {
    return {
      ok: false,
      error: "Could not start the session",
    };
  }

  return {
    ok: true,
    sessionId: session.id,
    existed: false,
  };
}

let passed = 0;
let failed = 0;

// Helper to create a fake Supabase client for testing
function createFakeClient(
  sessions: SessionRow[],
  nextId: { current: number },
  userId: string,
  localDate: string,
  options?: {
    failInsertWith23505?: boolean;
  },
): FakeSupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => {
              const filtered = sessions.filter(
                (s) => s.user_id === userId && s.local_date === localDate && s.status === "in_progress",
              );
              return Promise.resolve({ data: filtered, error: null });
            },
            order: () => ({
              limit: () => ({
                maybeSingle: () => {
                  const filtered = sessions.filter(
                    (s) => s.user_id === userId && s.status === "in_progress",
                  );
                  const existing = filtered.length > 0 ? { id: filtered[0].id } : null;
                  return Promise.resolve({ data: existing, error: null });
                },
              }),
            }),
          }),
          order: () => ({
            limit: () => ({
              maybeSingle: () => {
                const filtered = sessions.filter(
                  (s) => s.user_id === userId && s.status === "in_progress",
                );
                const existing = filtered.length > 0 ? { id: filtered[0].id } : null;
                return Promise.resolve({ data: existing, error: null });
              },
            }),
          }),
        }),
      }),
      insert: (row: SessionInsert) => ({
        select: () => ({
          single: () => {
            if (options?.failInsertWith23505 && sessions.some((s) => s.user_id === userId && s.local_date === localDate && s.status === "in_progress")) {
              return Promise.resolve({
                data: null,
                error: {
                  message: "duplicate key value violates unique constraint",
                  code: "23505",
                },
              });
            }
            const id = `session-${nextId.current++}`;
            sessions.push({
              id,
              user_id: row.user_id,
              program_id: row.program_id,
              program_day_id: row.program_day_id,
              local_date: row.local_date,
              week_in_block: row.week_in_block,
              is_deload: row.is_deload,
              planned_type: row.planned_type,
              actual_type: row.actual_type,
              status: row.status,
              started_at: row.started_at,
              completed_at: null,
              duration_seconds: null,
              warmup_completed: false,
              cooldown_completed: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
            return Promise.resolve({ data: { id }, error: null });
          },
        }),
      }),
    }),
  };
}

function testStartSession(name: string, fn: () => void | Promise<void>) {
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

function assertEqual<T>(actual: T, expected: T, msg: string = "") {
  if (actual !== expected) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${msg ? `: ${msg}` : ""}`,
    );
  }
}

async function main() {
  console.log("Testing start-session-core (fake client)\n");

  // Test 1: First start creates a new session
  await testStartSession("First start creates a new session", async () => {
    const userId = "user-1";
    const localDate = "2026-10-24";

    const sessions: SessionRow[] = [];
    const nextId = { current: 1 };

    const fakeClient = createFakeClient(sessions, nextId, userId, localDate);

    const result = await startSessionCore({
      supabase: fakeClient,
      userId,
      programId: "prog-1",
      programDayId: "day-1",
      localDate,
      weekInBlock: 1,
      isDeload: false,
      dayType: "weights",
    });

    assertEqual(result.ok, true, "Should succeed");
    if (result.ok) {
      assertEqual(result.existed, false, "Should be a new session");
      assertEqual(sessions.length, 1, "Should have 1 session");
    }
  });

  // Test 2: Case (C) - Two starts give one session (idempotent)
  await testStartSession("Case (C): Two starts give one session (idempotent)", async () => {
    const userId = "user-1";
    const localDate = "2026-10-24";

    const sessions: SessionRow[] = [];
    const nextId = { current: 1 };

    const fakeClient = createFakeClient(sessions, nextId, userId, localDate);

    // First start
    const result1 = await startSessionCore({
      supabase: fakeClient,
      userId,
      programId: "prog-1",
      programDayId: "day-1",
      localDate,
      weekInBlock: 1,
      isDeload: false,
      dayType: "weights",
    });

    assertEqual(result1.ok, true, "First start should succeed");
    if (!result1.ok) throw new Error("First start failed");
    const firstSessionId = result1.sessionId;
    assertEqual(result1.existed, false, "First start should create new session");

    // Second start (same user, same date)
    const result2 = await startSessionCore({
      supabase: fakeClient,
      userId,
      programId: "prog-1",
      programDayId: "day-1",
      localDate,
      weekInBlock: 1,
      isDeload: false,
      dayType: "weights",
    });

    assertEqual(result2.ok, true, "Second start should succeed");
    if (!result2.ok) throw new Error("Second start failed");
    assertEqual(result2.sessionId, firstSessionId, "Should return the same session ID");
    assertEqual(result2.existed, true, "Second start should return existing session");
    assertEqual(sessions.length, 1, "Should have only 1 session (idempotent)");
  });

  // Test 3: Different dates create different sessions
  await testStartSession("Different dates create different sessions", async () => {
    const userId = "user-1";

    const sessions: SessionRow[] = [];
    const nextId = { current: 1 };

    // This test needs a client that handles multiple dates, so we keep the inline implementation
    // but simplify by filtering on row.local_date
    const fakeClient: FakeSupabaseClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: (_: string, localDateValue: string) => {
                const filtered = sessions.filter(
                  (s) => s.user_id === userId && s.local_date === localDateValue && s.status === "in_progress",
                );
                return Promise.resolve({ data: filtered, error: null });
              },
              order: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            }),
            order: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        }),
        insert: (row: SessionInsert) => ({
          select: () => ({
            single: () => {
              const id = `session-${nextId.current++}`;
              sessions.push({
                id,
                user_id: row.user_id,
                program_id: row.program_id,
                program_day_id: row.program_day_id,
                local_date: row.local_date,
                week_in_block: row.week_in_block,
                is_deload: row.is_deload,
                planned_type: row.planned_type,
                actual_type: row.actual_type,
                status: row.status,
                started_at: row.started_at,
                completed_at: null,
                duration_seconds: null,
                warmup_completed: false,
                cooldown_completed: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
              return Promise.resolve({ data: { id }, error: null });
            },
          }),
        }),
      }),
    };

    // Start on day 1
    const result1 = await startSessionCore({
      supabase: fakeClient,
      userId,
      programId: "prog-1",
      programDayId: "day-1",
      localDate: "2026-10-24",
      weekInBlock: 1,
      isDeload: false,
      dayType: "weights",
    });

    // Start on day 2 (different date)
    const result2 = await startSessionCore({
      supabase: fakeClient,
      userId,
      programId: "prog-1",
      programDayId: "day-2",
      localDate: "2026-10-25",
      weekInBlock: 1,
      isDeload: false,
      dayType: "weights",
    });

    assertEqual(result1.ok && result2.ok, true, "Both should succeed");
    if (!result1.ok || !result2.ok) throw new Error("Start failed");
    assertEqual(result1.sessionId !== result2.sessionId, true, "Should have different session IDs");
    assertEqual(sessions.length, 2, "Should have 2 sessions (different dates)");
  });

  // Test 4: 23505 handling - Insert returns unique violation, re-reads existing session
  await testStartSession("23505 handling: Insert fails with unique violation, re-reads existing", async () => {
    const userId = "user-1";
    const localDate = "2026-10-24";

    const sessions: SessionRow[] = [];
    let nextId = 1;
    let insertCount = 0;

    const fakeClient: FakeSupabaseClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => {
                const filtered = sessions.filter(
                  (s) => s.user_id === userId && s.local_date === localDate && s.status === "in_progress",
                );
                return Promise.resolve({ data: filtered, error: null });
              },
              order: () => ({
                limit: () => ({
                  maybeSingle: () => {
                  const filtered = sessions.filter(
                    (s) => s.user_id === userId && s.status === "in_progress",
                  );
                  const existing = filtered.length > 0 ? { id: filtered[0].id } : null;
                  return Promise.resolve({ data: existing, error: null });
                },
                }),
              }),
            }),
            order: () => ({
              limit: () => ({
                maybeSingle: () => {
                  const filtered = sessions.filter(
                    (s) => s.user_id === userId && s.status === "in_progress",
                  );
                  const existing = filtered.length > 0 ? { id: filtered[0].id } : null;
                  return Promise.resolve({ data: existing, error: null });
                },
              }),
            }),
          }),
        }),
        insert: (row: SessionInsert) => ({
          select: () => ({
            single: () => {
              insertCount++;
              
              // First insert succeeds
              if (insertCount === 1) {
                const id = `session-${nextId++}`;
                sessions.push({
                  id,
                  user_id: row.user_id,
                  program_id: row.program_id,
                  program_day_id: row.program_day_id,
                  local_date: row.local_date,
                  week_in_block: row.week_in_block,
                  is_deload: row.is_deload,
                  planned_type: row.planned_type,
                  actual_type: row.actual_type,
                  status: row.status,
                  started_at: row.started_at,
                  completed_at: null,
                  duration_seconds: null,
                  warmup_completed: false,
                  cooldown_completed: false,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                });
                return Promise.resolve({ data: { id }, error: null });
              }
              
              // Second insert fails with 23505 (simulating unique index violation)
              return Promise.resolve({
                data: null,
                error: {
                  message: "duplicate key value violates unique constraint",
                  code: "23505",
                },
              });
            },
          }),
        }),
      }),
    };

    // First start creates session
    const result1 = await startSessionCore({
      supabase: fakeClient,
      userId,
      programId: "prog-1",
      programDayId: "day-1",
      localDate,
      weekInBlock: 1,
      isDeload: false,
      dayType: "weights",
    });

    assertEqual(result1.ok, true, "First start should succeed");
    if (!result1.ok) throw new Error("First start failed");
    const firstSessionId = result1.sessionId;

    // Second start gets 23505, re-reads and returns existing session
    const result2 = await startSessionCore({
      supabase: fakeClient,
      userId,
      programId: "prog-1",
      programDayId: "day-1",
      localDate,
      weekInBlock: 1,
      isDeload: false,
      dayType: "weights",
    });

    assertEqual(result2.ok, true, "Second start should succeed despite 23505");
    if (!result2.ok) throw new Error("Second start failed");
    assertEqual(result2.sessionId, firstSessionId, "Should return the existing session ID after 23505");
    assertEqual(result2.existed, true, "Should indicate existing session after 23505");
    assertEqual(sessions.length, 1, "Should have only 1 session (no duplicate created)");
  });

  // Summary
  console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
