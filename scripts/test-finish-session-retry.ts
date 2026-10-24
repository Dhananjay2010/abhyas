#!/usr/bin/env tsx
/**
 * Test that finish-session retry correctly re-reads the stored status.
 *
 *   npx tsx scripts/test-finish-session-retry.ts
 */

let testsPassed = 0;
let testsFailed = 0;

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    console.log(`  ok   ${message}`);
    testsPassed++;
  } else {
    console.error(`❌ ${message}`);
    console.error(`   Expected: ${JSON.stringify(expected)}`);
    console.error(`   Actual:   ${JSON.stringify(actual)}`);
    testsFailed++;
  }
}

type MockSupabaseClient = {
  from: (table: string) => {
    update: (data: unknown, opts?: { count: string }) => {
      eq: (col: string, val: unknown) => {
        eq: (col: string, val: unknown) => Promise<{ error: null; count: number }>;
      };
    };
    select: (cols: string) => {
      eq: (col: string, val: unknown) => Promise<{ data: unknown[]; error: null }>;
    };
  };
};

async function finishSessionCore(
  supabase: MockSupabaseClient,
  params: {
    sessionId: string;
    status: "completed" | "skipped";
    durationSeconds: number;
    cooldownCompleted: boolean;
  },
): Promise<{ ok: boolean; error?: string; data?: { status: string } }> {
  const status = params.status;
  const endedAt = new Date().toISOString();
  const clampedDuration = Math.max(0, Math.min(21600, Math.round(params.durationSeconds)));

  const { error, count } = await supabase
    .from("sessions")
    .update(
      {
        status,
        completed_at: status === "completed" ? endedAt : null,
        duration_seconds: clampedDuration,
        cooldown_completed: status === "completed" ? params.cooldownCompleted : undefined,
      },
      { count: "exact" },
    )
    .eq("id", params.sessionId)
    .eq("status", "in_progress");

  if (error) return { ok: false, error: "error.message" };

  // If 0 rows were updated, the session was already finished - re-read the actual status
  if (count === 0) {
    const { data: session, error: rereadError } = await supabase
      .from("sessions")
      .select("status")
      .eq("id", params.sessionId);

    if (rereadError) return { ok: false, error: "rereadError.message" };

    const actualStatus =
      Array.isArray(session) && session.length > 0
        ? (session[0] as { status: string }).status
        : "skipped";

    return { ok: true, data: { status: actualStatus as "completed" | "skipped" } };
  }

  return { ok: true, data: { status } };
}

async function runTests() {
  console.log("\nTesting finish-session retry re-read behavior\n");

  console.log("1. First finish attempt succeeds (count = 1)");
  {
    const mockSupabase: MockSupabaseClient = {
      from: () => ({
        update: (_, opts) => {
          assertEquals(opts?.count, "exact", "count: 'exact' requested on update");
          return {
            eq: () => ({
              eq: async () => ({ error: null, count: 1 }),
            }),
          };
        },
        select: () => ({
          eq: async () => ({ data: [], error: null }),
        }),
      }),
    };

    const result = await finishSessionCore(mockSupabase, {
      sessionId: "session-1",
      status: "completed",
      durationSeconds: 1800,
      cooldownCompleted: true,
    });

    assertEquals(result.ok, true, "First finish succeeds");
    assertEquals(result.data?.status, "completed", "Returns 'completed' status");
  }

  console.log("\n2. Retry after already finished (count = 0, re-read returns stored status)");
  {
    const mockSupabase: MockSupabaseClient = {
      from: (table) => {
        if (table === "sessions") {
          return {
            update: () => ({
              eq: () => ({
                eq: async () => ({ error: null, count: 0 }),
              }),
            }),
            select: () => ({
              eq: async () => ({
                data: [{ status: "completed" }],
                error: null,
              }),
            }),
          };
        }
        throw new Error("Unexpected table");
      },
    };

    const result = await finishSessionCore(mockSupabase, {
      sessionId: "session-1",
      status: "skipped",
      durationSeconds: 1800,
      cooldownCompleted: false,
    });

    assertEquals(result.ok, true, "Retry succeeds");
    assertEquals(
      result.data?.status,
      "completed",
      "Returns stored 'completed' (not retry's 'skipped')",
    );
  }

  console.log("\n3. Retry returns actual stored status (skipped)");
  {
    const mockSupabase: MockSupabaseClient = {
      from: (table) => {
        if (table === "sessions") {
          return {
            update: () => ({
              eq: () => ({
                eq: async () => ({ error: null, count: 0 }),
              }),
            }),
            select: () => ({
              eq: async () => ({
                data: [{ status: "skipped" }],
                error: null,
              }),
            }),
          };
        }
        throw new Error("Unexpected table");
      },
    };

    const result = await finishSessionCore(mockSupabase, {
      sessionId: "session-1",
      status: "completed",
      durationSeconds: 1800,
      cooldownCompleted: true,
    });

    assertEquals(result.ok, true, "Retry succeeds");
    assertEquals(
      result.data?.status,
      "skipped",
      "Returns stored 'skipped' (not retry's 'completed')",
    );
  }

  console.log(`\n✅ Passed: ${testsPassed}`);
  if (testsFailed > 0) {
    console.log(`❌ Failed: ${testsFailed}`);
    process.exit(1);
  }

  console.log("\n✨ All finish-session retry tests passed!");
}

runTests();
