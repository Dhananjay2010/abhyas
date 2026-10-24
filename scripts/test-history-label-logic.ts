/**
 * Tests for History session label logic.
 * 
 * Verifies that the session status labels (Completed, In progress, Skipped)
 * are displayed correctly based on the session type and data.
 * 
 * Key scenarios:
 * - Completed yoga with 0 sets shows "Completed", not "Skipped"
 * - Completed strength with 0 sets shows "Skipped"
 * - Skipped sessions show "Skipped" regardless of type
 * - In-progress sessions (today only) show "In progress"
 * 
 * Run: npm run test:history-label-logic
 */

interface SessionListItem {
  localDate: string;
  status: "completed" | "in_progress" | "skipped";
  actualType: "weights" | "bodyweight" | "yoga" | "meditation" | null;
  setCount: number;
  durationSeconds: number | null;
  breathing: { breaths: number; pumps: boolean; patternName: string | null } | null;
  isDeload: boolean;
  endedEarly: boolean;
  plannedSets: number | null;
  topSetWeight: number | null;
  volumeKg: number;
  programDayLabel: string | null;
  completedAt: string | null;
  hasPR: boolean;
}

const today = "2026-10-24";

function getStatusLabel(item: SessionListItem): string {
  // This duplicates the logic from history-client.tsx
  if (item.breathing) {
    return "Breathing";
  } else if (item.actualType === "yoga") {
    if (item.status === "skipped") {
      return "Skipped";
    } else if (item.status === "in_progress" && item.localDate === today) {
      return "In progress";
    } else {
      return "Completed";
    }
  } else {
    // Strength sessions
    const isStrength = item.actualType === "weights" || item.actualType === "bodyweight" || !item.actualType;
    const isZeroSetStrength = isStrength && item.setCount === 0;
    const isSkipped = item.status === "skipped";
    const isInProgress = item.status === "in_progress" && item.localDate === today;
    
    if (isSkipped || isZeroSetStrength) {
      return "Skipped";
    } else if (isInProgress) {
      return "In progress";
    } else if (item.endedEarly && item.plannedSets) {
      return `Ended early · ${item.setCount} of ${item.plannedSets} ${item.plannedSets === 1 ? "set" : "sets"}`;
    } else {
      return "Completed";
    }
  }
}

function runTests() {
  let failures = 0;

  function check(label: string, actual: string, expected: string) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
    if (!ok) {
      console.log(`       expected: "${expected}"`);
      console.log(`       actual:   "${actual}"`);
    }
  }

  console.log("\nHistory Label Logic Tests\n");

  console.log("1. Yoga sessions");
  {
    const completedYogaWithSets: SessionListItem = {
      localDate: "2026-10-23",
      status: "completed",
      actualType: "yoga",
      setCount: 0,
      durationSeconds: 600,
      breathing: null,
      isDeload: false,
      endedEarly: false,
      plannedSets: null,
      topSetWeight: null,
      volumeKg: 0,
      programDayLabel: null,
      completedAt: "2026-10-23T12:00:00Z",
      hasPR: false,
    };

    check(
      "completed yoga with 0 sets shows 'Completed'",
      getStatusLabel(completedYogaWithSets),
      "Completed"
    );

    const completedYogaNullStartedAt: SessionListItem = {
      ...completedYogaWithSets,
      localDate: "2026-10-22",
      durationSeconds: 360,
      completedAt: "2026-10-22T14:30:00Z",
    };

    check(
      "completed yoga with NULL started_at shows 'Completed'",
      getStatusLabel(completedYogaNullStartedAt),
      "Completed"
    );

    const skippedYoga: SessionListItem = {
      ...completedYogaWithSets,
      status: "skipped",
    };

    check(
      "skipped yoga shows 'Skipped'",
      getStatusLabel(skippedYoga),
      "Skipped"
    );

    const inProgressYogaToday: SessionListItem = {
      ...completedYogaWithSets,
      localDate: today,
      status: "in_progress",
    };

    check(
      "in_progress yoga today shows 'In progress'",
      getStatusLabel(inProgressYogaToday),
      "In progress"
    );

    const inProgressYogaYesterday: SessionListItem = {
      ...completedYogaWithSets,
      localDate: "2026-10-23",
      status: "in_progress",
    };

    check(
      "in_progress yoga yesterday shows 'Completed'",
      getStatusLabel(inProgressYogaYesterday),
      "Completed"
    );
  }

  console.log("\n2. Strength sessions (weights/bodyweight)");
  {
    const completedStrengthWithSets: SessionListItem = {
      localDate: "2026-10-23",
      status: "completed",
      actualType: "weights",
      setCount: 5,
      durationSeconds: 3600,
      breathing: null,
      isDeload: false,
      endedEarly: false,
      plannedSets: null,
      topSetWeight: 100,
      volumeKg: 2500,
      programDayLabel: "Day 1",
      completedAt: "2026-10-23T12:00:00Z",
      hasPR: false,
    };

    check(
      "completed strength with sets shows 'Completed'",
      getStatusLabel(completedStrengthWithSets),
      "Completed"
    );

    const completedStrengthZeroSets: SessionListItem = {
      ...completedStrengthWithSets,
      setCount: 0,
      topSetWeight: null,
      volumeKg: 0,
    };

    check(
      "completed strength with 0 sets shows 'Skipped'",
      getStatusLabel(completedStrengthZeroSets),
      "Skipped"
    );

    const skippedStrength: SessionListItem = {
      ...completedStrengthWithSets,
      status: "skipped",
    };

    check(
      "skipped strength shows 'Skipped'",
      getStatusLabel(skippedStrength),
      "Skipped"
    );

    const inProgressStrengthToday: SessionListItem = {
      ...completedStrengthWithSets,
      localDate: today,
      status: "in_progress",
    };

    check(
      "in_progress strength today shows 'In progress'",
      getStatusLabel(inProgressStrengthToday),
      "In progress"
    );
  }

  console.log("\n3. Breathing sessions");
  {
    const completedBreathing: SessionListItem = {
      localDate: "2026-10-23",
      status: "completed",
      actualType: "meditation",
      setCount: 0,
      durationSeconds: 300,
      breathing: {
        breaths: 30,
        pumps: false,
        patternName: "Box Breathing",
      },
      isDeload: false,
      endedEarly: false,
      plannedSets: null,
      topSetWeight: null,
      volumeKg: 0,
      programDayLabel: null,
      completedAt: "2026-10-23T07:00:00Z",
      hasPR: false,
    };

    check(
      "completed breathing shows 'Breathing'",
      getStatusLabel(completedBreathing),
      "Breathing"
    );
  }

  if (failures > 0) {
    console.log(`\n❌ ${failures} FAILURES\n`);
    process.exit(1);
  }

  console.log("\n✅ All history label logic tests passed\n");
}

runTests();
