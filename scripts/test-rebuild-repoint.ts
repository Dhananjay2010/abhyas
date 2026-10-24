/**
 * Test re-pointing of planned sessions after a program rebuild.
 *
 * QA H1: a "train anyway" day (or any planned session) survives a rebuild
 * pointing at the retired block, so Today shows "Rest" with no exercises and
 * Start loads the OLD plan. The fix re-points planned-but-unstarted sessions to
 * the new plan's matching day, or deletes them if no match exists.
 *
 *   npm run test:rebuild-repoint
 */
import { planRepointSessions } from "../src/lib/program/repoint-sessions";

type SessionRow = Parameters<typeof planRepointSessions>[0][number];
type NewDay = Parameters<typeof planRepointSessions>[1][number];

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function session(
  id: string,
  local_date: string,
  overrides: Partial<SessionRow> = {},
): SessionRow {
  return {
    id,
    local_date,
    actual_type: null,
    planned_type: "weights",
    program_day_id: `old-day-${id}`,
    has_sets: false,
    ...overrides,
  };
}

function day(id: string, day_type: "weights" | "bodyweight" | "rest", label: string | null = null): NewDay {
  return { id, day_type, label };
}

console.log("\n1. Re-point a train-anyway session to the new plan");
{
  const oldSessions = [
    session("s1", "2026-10-24", { actual_type: "weights", planned_type: "rest" }),
  ];
  const newDays = [day("new-upper", "weights", "Upper"), day("new-lower", "weights", "Lower")];
  const { toUpdate, toDelete } = planRepointSessions(oldSessions, newDays, "2026-10-24");

  check("session is re-pointed", toUpdate.length === 1);
  check("re-pointed to first matching day", toUpdate[0]?.newProgramDayId === "new-upper");
  check("nothing deleted", toDelete.length === 0);
}

console.log("\n2. Delete a train-anyway session when the new plan has no matching day");
{
  // 5→4 days: Upper/Lower/Upper/Lower/Full becomes Upper/Lower/Upper/Lower, no Full Body.
  const oldSessions = [
    session("s1", "2026-10-24", { actual_type: "bodyweight", planned_type: "rest" }),
  ];
  const newDays = [day("new-upper", "weights", "Upper"), day("new-lower", "weights", "Lower")];
  const { toUpdate, toDelete } = planRepointSessions(oldSessions, newDays, "2026-10-24");

  check("nothing re-pointed", toUpdate.length === 0);
  check("session is deleted", toDelete.length === 1 && toDelete[0] === "s1");
}

console.log("\n3. Sessions with logged sets are kept unchanged");
{
  const oldSessions = [
    session("s1", "2026-10-24", { has_sets: true, actual_type: "weights" }),
  ];
  const newDays = [day("new-upper", "weights", "Upper")];
  const { toUpdate, toDelete } = planRepointSessions(oldSessions, newDays, "2026-10-24");

  check("nothing re-pointed", toUpdate.length === 0, `toUpdate=${JSON.stringify(toUpdate)}`);
  check("nothing deleted", toDelete.length === 0);
}

console.log("\n4. Sessions before today are not re-pointed");
{
  const oldSessions = [
    session("s1", "2026-10-23", { actual_type: "weights" }),
  ];
  const newDays = [day("new-upper", "weights", "Upper")];
  const { toUpdate, toDelete } = planRepointSessions(oldSessions, newDays, "2026-10-24");

  check("nothing re-pointed", toUpdate.length === 0);
  check("nothing deleted", toDelete.length === 0);
}

console.log("\n5. Rest, yoga, and breathing overrides are kept as-is");
{
  const oldSessions = [
    session("s1", "2026-10-24", { actual_type: "rest", planned_type: "weights" }),
    session("s2", "2026-10-25", { actual_type: "yoga", planned_type: "weights" }),
    session("s3", "2026-10-26", { actual_type: "meditation", planned_type: "weights" }),
  ];
  const newDays = [day("new-upper", "weights", "Upper")];
  const { toUpdate, toDelete } = planRepointSessions(oldSessions, newDays, "2026-10-24");

  check("nothing re-pointed", toUpdate.length === 0, "non-training overrides have no program_day");
  check("nothing deleted", toDelete.length === 0);
}

console.log("\n6. Multiple sessions on different days are re-pointed correctly");
{
  const oldSessions = [
    session("s1", "2026-10-24", { actual_type: "weights", planned_type: "weights" }),
    session("s2", "2026-10-25", { actual_type: "weights", planned_type: "weights" }),
    session("s3", "2026-10-26", { actual_type: "weights", planned_type: "rest" }), // train-anyway
  ];
  const newDays = [day("new-upper", "weights", "Upper"), day("new-lower", "weights", "Lower")];
  const { toUpdate, toDelete } = planRepointSessions(oldSessions, newDays, "2026-10-24");

  check("all three re-pointed", toUpdate.length === 3);
  check("nothing deleted", toDelete.length === 0);
}

console.log("\n7. Bodyweight-only rebuild: weights sessions are deleted");
{
  // User had a gym plan, did a train-anyway Upper, then switched to bodyweight-only.
  const oldSessions = [
    session("s1", "2026-10-24", { actual_type: "weights", planned_type: "rest" }),
  ];
  const newDays = [day("new-full-body", "bodyweight", "Full Body A")];
  const { toUpdate, toDelete } = planRepointSessions(oldSessions, newDays, "2026-10-24");

  check("nothing re-pointed", toUpdate.length === 0, "new plan has no 'weights' day");
  check("weights session deleted", toDelete.length === 1 && toDelete[0] === "s1");
}

console.log("\n8. 3→5 days: sessions still re-point to matching types");
{
  const oldSessions = [
    session("s1", "2026-10-24", { actual_type: "bodyweight", planned_type: "rest" }), // Full Body A
  ];
  const newDays = [
    day("new-push", "weights", "Push"),
    day("new-pull", "weights", "Pull"),
    day("new-legs", "weights", "Legs"),
    day("new-upper", "weights", "Upper"),
    day("new-lower", "weights", "Lower"),
  ];
  const { toUpdate, toDelete } = planRepointSessions(oldSessions, newDays, "2026-10-24");

  check("nothing re-pointed", toUpdate.length === 0, "bodyweight session, new plan has only weights");
  check("session deleted", toDelete.length === 1, "no matching bodyweight day in 5-day weights plan");
}

console.log("\n9. Match by actual_type for train-anyway, planned_type for Keep");
{
  const oldSessions = [
    // Train-anyway Upper on a Rest day: actual_type = weights, planned_type = rest.
    session("s1", "2026-10-24", { actual_type: "weights", planned_type: "rest" }),
    // Keep the plan: actual_type = planned_type = weights.
    session("s2", "2026-10-25", { actual_type: "weights", planned_type: "weights" }),
  ];
  const newDays = [day("new-upper", "weights", "Upper"), day("new-lower", "weights", "Lower")];
  const { toUpdate, toDelete } = planRepointSessions(oldSessions, newDays, "2026-10-24");

  check("both re-pointed", toUpdate.length === 2);
  check("nothing deleted", toDelete.length === 0);
  check("train-anyway matched", toUpdate.some((u) => u.id === "s1" && u.newProgramDayId === "new-upper"));
  check("keep matched", toUpdate.some((u) => u.id === "s2" && u.newProgramDayId === "new-upper"));
}

console.log("\n10. Deterministic matching: first day of matching type wins");
{
  // Upper/Lower split has two Upper days. The first one (by day_index) is picked.
  const oldSessions = [
    session("s1", "2026-10-24", { actual_type: "weights", planned_type: "rest" }),
  ];
  const newDays = [
    day("new-upper-1", "weights", "Upper"),
    day("new-lower-1", "weights", "Lower"),
    day("new-upper-2", "weights", "Upper"),
    day("new-lower-2", "weights", "Lower"),
  ];
  const { toUpdate, toDelete } = planRepointSessions(oldSessions, newDays, "2026-10-24");

  check("re-pointed to first Upper", toUpdate.length === 1 && toUpdate[0]?.newProgramDayId === "new-upper-1");
}

if (failures > 0) {
  console.log(`\n❌ ${failures} failure(s)`);
  process.exit(1);
} else {
  console.log("\n✅ All checks passed");
}
