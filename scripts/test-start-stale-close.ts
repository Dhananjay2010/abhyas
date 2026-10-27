/**
 * Test the start-session stale-close logic (L3 from actions.ts).
 * 
 * This tests buildStartSessionStaleDeps + startSessionStaleCore with a real
 * createClient<Database> + stub fetch (fake PostgREST), driving the real
 * closeStaleSessions/closeStaleSessionsCore with injected clock.
 * 
 * Cases tested:
 * (a) Stale 8h cross-date in_progress row is closed in DB, shouldInsert=true
 * (b) Fresh 2h cross-date row is resumed with existing id, row untouched
 * (c) Same-date row handled (no stale candidates)
 * (d) Other-date planned/skipped rows are not passed to close
 * (e) Close throw returns {ok:false}
 * (f) Remaining-session check filters status=in_progress
 * 
 * Must catch breaks: a (core call removed), a2 (no-op adapter), c2 (resume ignored),
 * e, e2 (status filter), f (throw)
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { startSessionStaleCore } from "@/lib/session/start-session-stale-core";
import { buildStartSessionStaleDeps } from "@/lib/session/build-start-session-stale-deps";
import type { OpenSession } from "@/lib/session/close-stale";

// Minimal session type for testing
type Session = {
  id: string;
  user_id: string;
  program_id: string;
  program_day_id: string;
  local_date: string;
  week_in_block: number;
  is_deload: boolean;
  planned_type: string;
  actual_type: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type SessionExercise = { session_id: string; exercise_id: string };
type SessionSet = { session_id: string; set_number: number };

const USER_ID = "user-test";
const TODAY = "2026-10-26";
const YESTERDAY = "2026-10-25";

// Inject a fixed clock
const NOW_MS = new Date("2026-10-26T10:00:00Z").getTime();

/**
 * Create a stub fetch that responds to Supabase PostgREST queries.
 * Maintains in-memory state for sessions, exercises, and sets.
 */
function createStubFetch(
  sessions: Session[],
  exercises: SessionExercise[],
  sets: SessionSet[]
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const bodyText = init?.body && typeof init.body === "string" ? init.body : null;
    const body = bodyText ? JSON.parse(bodyText) : null;

    // SELECT sessions
    if (url.includes("/sessions?") && method === "GET") {
      let filtered = [...sessions];
      
      // Parse filters from URL
      if (url.includes("user_id=eq.")) {
        const userId = url.match(/user_id=eq\.([^&]+)/)?.[1];
        filtered = filtered.filter(s => s.user_id === userId);
      }
      if (url.includes("status=eq.")) {
        const status = url.match(/status=eq\.([^&]+)/)?.[1];
        filtered = filtered.filter(s => s.status === status);
      }
      if (url.includes("local_date=eq.")) {
        const localDate = url.match(/local_date=eq\.([^&]+)/)?.[1];
        filtered = filtered.filter(s => s.local_date === localDate);
      }
      if (url.includes("status=in.")) {
        const statuses = url.match(/status=in\.\(([^)]+)\)/)?.[1].split(",") ?? [];
        filtered = filtered.filter(s => statuses.includes(s.status));
      }
      
      // Order and limit
      if (url.includes("order=created_at.desc")) {
        filtered.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      }
      if (url.includes("limit=1")) {
        filtered = filtered.slice(0, 1);
      }
      
      return new Response(JSON.stringify(filtered), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // PATCH sessions (close stale)
    if (url.includes("/sessions?") && method === "PATCH" && body) {
      const sessionId = url.match(/id=eq\.([^&]+)/)?.[1];
      const session = sessions.find(s => s.id === sessionId);
      if (session && body.status) {
        session.status = body.status;
        if (body.completed_at) session.completed_at = body.completed_at;
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // SELECT session_exercises
    if (url.includes("/session_exercises?") && method === "GET") {
      const sessionId = url.match(/session_id=eq\.([^&]+)/)?.[1];
      const filtered = exercises.filter(e => e.session_id === sessionId);
      return new Response(JSON.stringify(filtered), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // SELECT session_exercise_sets
    if (url.includes("/session_exercise_sets?") && method === "GET") {
      const sessionId = url.match(/session_id=eq\.([^&]+)/)?.[1];
      const filtered = sets.filter(s => s.session_id === sessionId);
      return new Response(JSON.stringify(filtered), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Default: empty array
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

/**
 * Test (a): Stale 8h cross-date in_progress row is closed in DB, shouldInsert=true
 */
async function testStaleSessionClosed() {
  const staleSession: Session = {
    id: "sess-stale",
    user_id: USER_ID,
    program_id: "prog-1",
    program_day_id: "day-1",
    local_date: YESTERDAY,
    week_in_block: 1,
    is_deload: false,
    planned_type: "weights",
    actual_type: "weights",
    status: "in_progress",
    started_at: new Date(NOW_MS - 8 * 3600 * 1000).toISOString(), // 8h ago
    completed_at: null,
    created_at: new Date(NOW_MS - 8 * 3600 * 1000).toISOString(),
    updated_at: new Date(NOW_MS - 8 * 3600 * 1000).toISOString(),
  };

  const sessions = [staleSession];
  const client = createClient<Database>("http://localhost:54321", "test-key", {
    global: { fetch: createStubFetch(sessions, [], []) },
  });

  const openSessions: OpenSession[] = [{
    id: staleSession.id,
    status: staleSession.status,
    local_date: staleSession.local_date,
    actual_type: staleSession.actual_type,
    started_at: staleSession.started_at,
  }];

  const deps = buildStartSessionStaleDeps(client, USER_ID, openSessions, TODAY, NOW_MS);
  const result = await startSessionStaleCore(deps);

  if (!result.ok) {
    throw new Error(`Test (a) failed: ${result.error}`);
  }
  if (!result.shouldInsert) {
    throw new Error(`Test (a) failed: Expected shouldInsert=true, got false`);
  }
  if (sessions[0].status === "in_progress") {
    throw new Error(`Test (a) failed: Expected session closed, still in_progress`);
  }

  console.log("✓ Test (a): Stale 8h cross-date session closed in DB, shouldInsert=true");
}

/**
 * Test (b): Fresh 2h cross-date row resumed with existing id, row untouched
 */
async function testFreshSessionResumed() {
  const freshSession: Session = {
    id: "sess-fresh",
    user_id: USER_ID,
    program_id: "prog-1",
    program_day_id: "day-1",
    local_date: YESTERDAY,
    week_in_block: 1,
    is_deload: false,
    planned_type: "weights",
    actual_type: "weights",
    status: "in_progress",
    started_at: new Date(NOW_MS - 2 * 3600 * 1000).toISOString(), // 2h ago
    completed_at: null,
    created_at: new Date(NOW_MS - 2 * 3600 * 1000).toISOString(),
    updated_at: new Date(NOW_MS - 2 * 3600 * 1000).toISOString(),
  };

  const sessions = [freshSession];
  const client = createClient<Database>("http://localhost:54321", "test-key", {
    global: { fetch: createStubFetch(sessions, [], []) },
  });

  const openSessions: OpenSession[] = [{
    id: freshSession.id,
    status: freshSession.status,
    local_date: freshSession.local_date,
    actual_type: freshSession.actual_type,
    started_at: freshSession.started_at,
  }];

  const deps = buildStartSessionStaleDeps(client, USER_ID, openSessions, TODAY, NOW_MS);
  const result = await startSessionStaleCore(deps);

  if (!result.ok) {
    throw new Error(`Test (b) failed: ${result.error}`);
  }
  if (result.shouldInsert) {
    throw new Error(`Test (b) failed: Expected shouldInsert=false, got true`);
  }
  if (result.resumeSessionId !== freshSession.id) {
    throw new Error(`Test (b) failed: Expected resumeSessionId=${freshSession.id}, got ${result.resumeSessionId}`);
  }
  if (sessions[0].status !== "in_progress") {
    throw new Error(`Test (b) failed: Expected session untouched (in_progress), got ${sessions[0].status}`);
  }

  console.log("✓ Test (b): Fresh 2h cross-date session resumed, row untouched");
}

/**
 * Test (c): Same-date row (no stale candidates)
 */
async function testSameDateNoStaleCandidates() {
  const todaySession: Session = {
    id: "sess-today",
    user_id: USER_ID,
    program_id: "prog-1",
    program_day_id: "day-1",
    local_date: TODAY,
    week_in_block: 1,
    is_deload: false,
    planned_type: "weights",
    actual_type: "weights",
    status: "in_progress",
    started_at: new Date(NOW_MS).toISOString(),
    completed_at: null,
    created_at: new Date(NOW_MS).toISOString(),
    updated_at: new Date(NOW_MS).toISOString(),
  };

  const sessions = [todaySession];
  const client = createClient<Database>("http://localhost:54321", "test-key", {
    global: { fetch: createStubFetch(sessions, [], []) },
  });

  const openSessions: OpenSession[] = [{
    id: todaySession.id,
    status: todaySession.status,
    local_date: todaySession.local_date,
    actual_type: todaySession.actual_type,
    started_at: todaySession.started_at,
  }];

  const deps = buildStartSessionStaleDeps(client, USER_ID, openSessions, TODAY, NOW_MS);
  const result = await startSessionStaleCore(deps);

  if (!result.ok) {
    throw new Error(`Test (c) failed: ${result.error}`);
  }
  if (!result.shouldInsert) {
    throw new Error(`Test (c) failed: Expected shouldInsert=true (no stale candidates), got false`);
  }

  console.log("✓ Test (c): Same-date session, no stale candidates, shouldInsert=true");
}

/**
 * Test (d): Other-date planned/skipped rows are not passed to close
 */
async function testPlannedSkippedNotPassed() {
  const plannedSession: Session = {
    id: "sess-planned",
    user_id: USER_ID,
    program_id: "prog-1",
    program_day_id: "day-1",
    local_date: YESTERDAY,
    week_in_block: 1,
    is_deload: false,
    planned_type: "weights",
    actual_type: null,
    status: "planned",
    started_at: null,
    completed_at: null,
    created_at: new Date(NOW_MS - 24 * 3600 * 1000).toISOString(),
    updated_at: new Date(NOW_MS - 24 * 3600 * 1000).toISOString(),
  };

  const skippedSession: Session = {
    id: "sess-skipped",
    user_id: USER_ID,
    program_id: "prog-1",
    program_day_id: "day-2",
    local_date: YESTERDAY,
    week_in_block: 1,
    is_deload: false,
    planned_type: "yoga",
    actual_type: "yoga",
    status: "skipped",
    started_at: null,
    completed_at: null,
    created_at: new Date(NOW_MS - 24 * 3600 * 1000).toISOString(),
    updated_at: new Date(NOW_MS - 24 * 3600 * 1000).toISOString(),
  };

  const sessions = [plannedSession, skippedSession];
  const client = createClient<Database>("http://localhost:54321", "test-key", {
    global: { fetch: createStubFetch(sessions, [], []) },
  });

  const openSessions: OpenSession[] = [
    {
      id: plannedSession.id,
      status: plannedSession.status,
      local_date: plannedSession.local_date,
      actual_type: plannedSession.actual_type,
      started_at: plannedSession.started_at,
    },
    {
      id: skippedSession.id,
      status: skippedSession.status,
      local_date: skippedSession.local_date,
      actual_type: skippedSession.actual_type,
      started_at: skippedSession.started_at,
    },
  ];

  const deps = buildStartSessionStaleDeps(client, USER_ID, openSessions, TODAY, NOW_MS);
  const result = await startSessionStaleCore(deps);

  if (!result.ok) {
    throw new Error(`Test (d) failed: ${result.error}`);
  }
  if (!result.shouldInsert) {
    throw new Error(`Test (d) failed: Expected shouldInsert=true (no in_progress to close), got false`);
  }
  // Verify sessions were not touched (still planned/skipped)
  if (sessions[0].status !== "planned") {
    throw new Error(`Test (d) failed: planned session was modified to ${sessions[0].status}`);
  }
  if (sessions[1].status !== "skipped") {
    throw new Error(`Test (d) failed: skipped session was modified to ${sessions[1].status}`);
  }

  console.log("✓ Test (d): Other-date planned/skipped not passed to close");
}

/**
 * Test (e): Close throw returns {ok:false}
 */
async function testCloseThrowHandled() {
  const staleSession: Session = {
    id: "sess-stale-throw",
    user_id: USER_ID,
    program_id: "prog-1",
    program_day_id: "day-1",
    local_date: YESTERDAY,
    week_in_block: 1,
    is_deload: false,
    planned_type: "weights",
    actual_type: "weights",
    status: "in_progress",
    started_at: new Date(NOW_MS - 8 * 3600 * 1000).toISOString(),
    completed_at: null,
    created_at: new Date(NOW_MS - 8 * 3600 * 1000).toISOString(),
    updated_at: new Date(NOW_MS - 8 * 3600 * 1000).toISOString(),
  };

  // Create a fetch stub that throws on session_exercises query (simulating DB error during close)
  const throwingFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    
    // Throw on session_exercises query (closeStaleSessionsCore reads these to check for sets)
    if (url.includes("/session_exercises?")) {
      throw new Error("Simulated DB error");
    }
    
    // Delegate to normal stub for other queries
    return createStubFetch([staleSession], [], [])(input, init);
  };

  const client = createClient<Database>("http://localhost:54321", "test-key", {
    global: { fetch: throwingFetch },
  });

  const openSessions: OpenSession[] = [{
    id: staleSession.id,
    status: staleSession.status,
    local_date: staleSession.local_date,
    actual_type: staleSession.actual_type,
    started_at: staleSession.started_at,
  }];

  const deps = buildStartSessionStaleDeps(client, USER_ID, openSessions, TODAY, NOW_MS);
  const result = await startSessionStaleCore(deps);

  if (result.ok) {
    throw new Error(`Test (e) failed: Expected {ok:false}, got ok=true`);
  }
  // Just check that an error was returned
  if (!result.error || result.error.length === 0) {
    throw new Error(`Test (e) failed: Expected error message, got empty string`);
  }

  console.log("✓ Test (e): Close throw returns {ok:false, error}");
}

/**
 * Test (f): Remaining-session check filters status=in_progress
 */
async function testRemainingCheckFiltersStatus() {
  const completedSession: Session = {
    id: "sess-completed",
    user_id: USER_ID,
    program_id: "prog-1",
    program_day_id: "day-1",
    local_date: YESTERDAY,
    week_in_block: 1,
    is_deload: false,
    planned_type: "weights",
    actual_type: "weights",
    status: "completed",
    started_at: new Date(NOW_MS - 2 * 3600 * 1000).toISOString(),
    completed_at: new Date(NOW_MS - 1 * 3600 * 1000).toISOString(),
    created_at: new Date(NOW_MS - 2 * 3600 * 1000).toISOString(),
    updated_at: new Date(NOW_MS - 1 * 3600 * 1000).toISOString(),
  };

  const sessions = [completedSession];
  const client = createClient<Database>("http://localhost:54321", "test-key", {
    global: { fetch: createStubFetch(sessions, [], []) },
  });

  // The openSessions still reports it as in_progress (simulating a race or stale read)
  const openSessions: OpenSession[] = [{
    id: completedSession.id,
    status: "in_progress", // Stale status from openRes
    local_date: completedSession.local_date,
    actual_type: completedSession.actual_type,
    started_at: completedSession.started_at,
  }];

  const deps = buildStartSessionStaleDeps(client, USER_ID, openSessions, TODAY, NOW_MS);
  const result = await startSessionStaleCore(deps);

  if (!result.ok) {
    throw new Error(`Test (f) failed: ${result.error}`);
  }
  if (!result.shouldInsert) {
    throw new Error(`Test (f) failed: Expected shouldInsert=true (completed session filtered out), got false`);
  }

  console.log("✓ Test (f): Remaining-check filters status=in_progress");
}

/**
 * Test (B2): Second user's in_progress row is not closed (user_id filter)
 */
async function testSecondUserNotClosed() {
  const USER_TWO = "user-two";
  
  const userOneSession: Session = {
    id: "sess-user-one",
    user_id: USER_ID,
    program_id: "prog-1",
    program_day_id: "day-1",
    local_date: YESTERDAY,
    week_in_block: 1,
    is_deload: false,
    planned_type: "weights",
    actual_type: "weights",
    status: "in_progress",
    started_at: new Date(NOW_MS - 8 * 3600 * 1000).toISOString(), // 8h ago
    completed_at: null,
    created_at: new Date(NOW_MS - 8 * 3600 * 1000).toISOString(),
    updated_at: new Date(NOW_MS - 8 * 3600 * 1000).toISOString(),
  };

  const userTwoSession: Session = {
    id: "sess-user-two",
    user_id: USER_TWO,
    program_id: "prog-1",
    program_day_id: "day-1",
    local_date: YESTERDAY,
    week_in_block: 1,
    is_deload: false,
    planned_type: "weights",
    actual_type: "weights",
    status: "in_progress",
    started_at: new Date(NOW_MS - 8 * 3600 * 1000).toISOString(), // 8h ago
    completed_at: null,
    created_at: new Date(NOW_MS - 8 * 3600 * 1000).toISOString(),
    updated_at: new Date(NOW_MS - 8 * 3600 * 1000).toISOString(),
  };

  const sessions = [userOneSession, userTwoSession];
  const client = createClient<Database>("http://localhost:54321", "test-key", {
    global: { fetch: createStubFetch(sessions, [], []) },
  });

  // Only userOneSession is in openSessions
  const openSessions: OpenSession[] = [{
    id: userOneSession.id,
    status: userOneSession.status,
    local_date: userOneSession.local_date,
    actual_type: userOneSession.actual_type,
    started_at: userOneSession.started_at,
  }];

  const deps = buildStartSessionStaleDeps(client, USER_ID, openSessions, TODAY, NOW_MS);
  const result = await startSessionStaleCore(deps);

  if (!result.ok) {
    throw new Error(`Test (B2) failed: ${result.error}`);
  }
  if (!result.shouldInsert) {
    throw new Error(`Test (B2) failed: Expected shouldInsert=true, got false`);
  }
  if (sessions[0].status === "in_progress") {
    throw new Error(`Test (B2) failed: user one's session should be closed`);
  }
  if (sessions[1].status !== "in_progress") {
    throw new Error(`Test (B2) failed: user two's session should remain in_progress`);
  }

  console.log("✓ Test (B2): Second user's in_progress row not closed (user_id filter works)");
}

/**
 * Test: today parameter changes the outcome
 * 
 * If today is 2026-10-25, then the session is same-date (not stale candidate).
 * If today is 2026-10-26, then the session is cross-date (stale candidate, closed).
 */
async function testTodayChangesOutcome() {
  const sessionOn20261025: Session = {
    id: "sess-20261025",
    user_id: USER_ID,
    program_id: "prog-1",
    program_day_id: "day-1",
    local_date: YESTERDAY,
    week_in_block: 1,
    is_deload: false,
    planned_type: "weights",
    actual_type: "weights",
    status: "in_progress",
    started_at: new Date(NOW_MS - 8 * 3600 * 1000).toISOString(), // 8h ago
    completed_at: null,
    created_at: new Date(NOW_MS - 8 * 3600 * 1000).toISOString(),
    updated_at: new Date(NOW_MS - 8 * 3600 * 1000).toISOString(),
  };

  const sessions = [{ ...sessionOn20261025 }];
  const client = createClient<Database>("http://localhost:54321", "test-key", {
    global: { fetch: createStubFetch(sessions, [], []) },
  });

  const openSessions: OpenSession[] = [{
    id: sessionOn20261025.id,
    status: sessionOn20261025.status,
    local_date: sessionOn20261025.local_date,
    actual_type: sessionOn20261025.actual_type,
    started_at: sessionOn20261025.started_at,
  }];

  // Case 1: today = YESTERDAY (same date as session)
  const depsYesterday = buildStartSessionStaleDeps(client, USER_ID, openSessions, YESTERDAY, NOW_MS);
  const resultYesterday = await startSessionStaleCore(depsYesterday);

  if (!resultYesterday.ok) {
    throw new Error(`Test case 1 failed: ${resultYesterday.error}`);
  }
  if (!resultYesterday.shouldInsert) {
    throw new Error(`Test case 1 failed: Expected shouldInsert=true (no stale candidates), got false`);
  }
  if (sessions[0].status !== "in_progress") {
    throw new Error(`Test case 1 failed: Session should remain in_progress (same date)`);
  }

  // Case 2: today = TODAY (cross-date, stale candidate)
  // Reset session to in_progress for second test
  sessions[0].status = "in_progress";
  const depsToday = buildStartSessionStaleDeps(client, USER_ID, openSessions, TODAY, NOW_MS);
  const resultToday = await startSessionStaleCore(depsToday);

  if (!resultToday.ok) {
    throw new Error(`Test case 2 failed: ${resultToday.error}`);
  }
  if (!resultToday.shouldInsert) {
    throw new Error(`Test case 2 failed: Expected shouldInsert=true (stale closed), got false`);
  }
  if (sessions[0].status === "in_progress") {
    throw new Error(`Test case 2 failed: Session should be closed (cross-date stale)`);
  }

  console.log("✓ Test: today parameter changes outcome (same-date vs cross-date)");
}

/**
 * Test (BUG CATCH): checkRemainingInProgress error propagates
 */
async function testRemainingCheckError() {
  const errorFetch: typeof fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/sessions?") && url.includes("status=eq.in_progress") && url.includes("order=created_at.desc")) {
      return new Response(JSON.stringify({ message: "Database error", code: "PGRST301" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const client = createClient("http://test.supabase.co", "test-key", { global: { fetch: errorFetch } });
  
  const staleDeps = buildStartSessionStaleDeps(
    client,
    USER_ID,
    [{ id: "sess-stale", status: "in_progress", local_date: YESTERDAY, actual_type: null, started_at: null }],
    TODAY,
    NOW_MS
  );

  const result = await startSessionStaleCore(staleDeps);

  if (result.ok) {
    throw new Error("Expected error, got ok");
  }
}

// Run all tests
(async () => {
  try {
    await testStaleSessionClosed();
    await testFreshSessionResumed();
    await testSameDateNoStaleCandidates();
    await testPlannedSkippedNotPassed();
    await testCloseThrowHandled();
    await testRemainingCheckFiltersStatus();
    await testSecondUserNotClosed();
    await testTodayChangesOutcome();
    await testRemainingCheckError();
    console.log("\n✅ All tests passed");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:");
    console.error(error);
    process.exit(1);
  }
})();
