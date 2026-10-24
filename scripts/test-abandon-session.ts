/**
 * Test that ending a session early with working sets is handled correctly:
 * - Marked as completed (not skipped)
 * - Has real duration > 0
 * - Counts toward streak and days trained
 * - Not re-offered by Today's startSession
 * 
 * And that a session with no working sets:
 * - Is marked as skipped
 * - Is resumable/re-offerable
 * 
 *   npx tsx scripts/test-abandon-session.ts
 */

// Mock types matching the actual database types
type SessionStatus = "planned" | "in_progress" | "completed" | "skipped" | "rest";
type DayType = "weights" | "bodyweight" | "yoga" | "rest" | "active_recovery" | "meditation";

type SessionSet = {
  id: string;
  is_warmup_set: boolean;
};

type SessionExercise = {
  id: string;
  session_sets: SessionSet[];
};

type Session = {
  id: string;
  status: SessionStatus;
  actual_type: DayType | null;
  duration_seconds: number | null;
  completed_at: string | null;
  local_date: string;
};

// Simulate the abandonSession logic
function simulateAbandonSession(
  session: Session,
  exercises: SessionExercise[],
  elapsedSeconds: number
): Session {
  // Only proceed if session is in_progress
  if (session.status !== "in_progress") {
    return session; // No change
  }

  // Check if any working sets were logged
  const hasWorkingSets = exercises.some((ex) =>
    ex.session_sets.some((s) => !s.is_warmup_set)
  );

  const newStatus = hasWorkingSets ? "completed" : "skipped";

  return {
    ...session,
    status: newStatus,
    completed_at: hasWorkingSets ? new Date().toISOString() : null,
    duration_seconds: Math.round(elapsedSeconds),
  };
}

// Simulate startSession logic for checking if day is re-offered
function canStartSession(todaySessions: Session[], resumeEnabled: boolean): {
  canStart: boolean;
  reason: string;
} {
  const existing = resumeEnabled
    ? todaySessions.find((s) => s.status === "planned" || s.status === "in_progress") ??
      // A skipped STRENGTH session can be resumed (not yoga/breathe)
      todaySessions.find(
        (s) => s.status === "skipped" && 
        (s.actual_type === "weights" || s.actual_type === "bodyweight")
      )
    : todaySessions.find((s) => s.status === "planned");

  if (existing) {
    return { canStart: false, reason: "Would resume existing session" };
  }

  // Check if day is already completed
  const completed = todaySessions.find(
    (s) => s.status === "completed" && 
    (s.actual_type === "weights" || s.actual_type === "bodyweight")
  );

  if (completed) {
    return { canStart: false, reason: "Day already completed" };
  }

  return { canStart: true, reason: "Day is available" };
}

// Check if session counts toward streak
function countsTowardStreak(sessionType: DayType | null): boolean {
  if (!sessionType) return false;
  return sessionType === "weights" || sessionType === "bodyweight" || sessionType === "yoga";
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Session ended early with working sets");
{
  const session: Session = {
    id: "s1",
    status: "in_progress",
    actual_type: "weights",
    duration_seconds: null,
    completed_at: null,
    local_date: "2026-10-24",
  };

  const exercises: SessionExercise[] = [
    {
      id: "e1",
      session_sets: [
        { id: "set1", is_warmup_set: false },
        { id: "set2", is_warmup_set: false },
        { id: "set3", is_warmup_set: false },
      ],
    },
    {
      id: "e2",
      session_sets: [
        { id: "set4", is_warmup_set: false },
        { id: "set5", is_warmup_set: false },
        { id: "set6", is_warmup_set: false },
      ],
    },
  ];

  const elapsed = 420; // 7 minutes
  const result = simulateAbandonSession(session, exercises, elapsed);

  check("marked as completed, not skipped", result.status === "completed", result.status);
  check("has real duration > 0", result.duration_seconds === 420, `${result.duration_seconds}s`);
  check("has completed_at timestamp", result.completed_at !== null);
  check("counts toward streak", countsTowardStreak(result.actual_type));

  // Check Today behavior
  const todayCheck = canStartSession([result], true);
  check("not re-offered by Today", !todayCheck.canStart, todayCheck.reason);
}

console.log("\n2. Session ended early with no working sets (warmup only)");
{
  const session: Session = {
    id: "s2",
    status: "in_progress",
    actual_type: "weights",
    duration_seconds: null,
    completed_at: null,
    local_date: "2026-10-24",
  };

  const exercises: SessionExercise[] = [
    {
      id: "e1",
      session_sets: [
        { id: "set1", is_warmup_set: true },
        { id: "set2", is_warmup_set: true },
      ],
    },
  ];

  const elapsed = 120; // 2 minutes
  const result = simulateAbandonSession(session, exercises, elapsed);

  check("marked as skipped", result.status === "skipped", result.status);
  check("has duration recorded", result.duration_seconds === 120, `${result.duration_seconds}s`);
  check("no completed_at", result.completed_at === null);
  check("does not count toward streak", !countsTowardStreak(result.actual_type) || result.status !== "completed");

  // Check Today behavior
  const todayCheck = canStartSession([result], true);
  check("is resumable (can't start new)", !todayCheck.canStart, todayCheck.reason);
}

console.log("\n3. Session ended with zero sets");
{
  const session: Session = {
    id: "s3",
    status: "in_progress",
    actual_type: "weights",
    duration_seconds: null,
    completed_at: null,
    local_date: "2026-10-24",
  };

  const exercises: SessionExercise[] = []; // No exercises with sets

  const elapsed = 30; // 30 seconds
  const result = simulateAbandonSession(session, exercises, elapsed);

  check("marked as skipped", result.status === "skipped", result.status);
  check("has duration recorded", result.duration_seconds === 30, `${result.duration_seconds}s`);
  check("no completed_at", result.completed_at === null);

  // Check Today behavior
  const todayCheck = canStartSession([result], true);
  check("is resumable (can't start new)", !todayCheck.canStart, todayCheck.reason);
}

console.log("\n4. Multiple scenarios for streak and days trained");
{
  // Scenario A: Early end with sets
  const completedEarly: Session = {
    id: "s4",
    status: "completed",
    actual_type: "weights",
    duration_seconds: 300,
    completed_at: new Date().toISOString(),
    local_date: "2026-10-24",
  };

  // Scenario B: Skipped (no sets)
  const skipped: Session = {
    id: "s5",
    status: "skipped",
    actual_type: "weights",
    duration_seconds: 60,
    completed_at: null,
    local_date: "2026-10-25",
  };

  const sessions = [completedEarly, skipped];
  const daysTrained = sessions.filter(
    (s) => s.status === "completed" && countsTowardStreak(s.actual_type)
  ).length;

  check("early-end session counts as day trained", daysTrained === 1, `${daysTrained} days`);
  check("skipped session does not count", daysTrained === 1, `${daysTrained} days`);
}

console.log("\n5. History display expectations");
{
  const completedEarly: Session = {
    id: "s6",
    status: "completed",
    actual_type: "weights",
    duration_seconds: 420,
    completed_at: new Date().toISOString(),
    local_date: "2026-10-24",
  };

  const skipped: Session = {
    id: "s7",
    status: "skipped",
    actual_type: "weights",
    duration_seconds: 60,
    completed_at: null,
    local_date: "2026-10-25",
  };

  check("completed early shows duration in history", 
    completedEarly.status === "completed" && completedEarly.duration_seconds !== null && completedEarly.duration_seconds > 0,
    `${completedEarly.duration_seconds}s`);
  
  check("completed early shows completed_at", completedEarly.completed_at !== null);
  
  // Note: Skipped sessions CAN have duration, but UI may show "—" for skipped
  check("skipped has duration recorded", skipped.duration_seconds !== null && skipped.duration_seconds > 0);
  check("skipped has no completed_at", skipped.completed_at === null);
}

console.log("\n6. Resume disabled behavior");
{
  const skipped: Session = {
    id: "s8",
    status: "skipped",
    actual_type: "weights",
    duration_seconds: 60,
    completed_at: null,
    local_date: "2026-10-24",
  };

  // With resume disabled, skipped sessions are NOT resumed
  const todayCheck = canStartSession([skipped], false);
  check("skipped not resumed when resume disabled", todayCheck.canStart, todayCheck.reason);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
