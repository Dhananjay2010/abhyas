/**
 * Test old-block day matching (X8, X9, X16).
 *
 * After a rebuild, sessions point to retired program_days.
 * The repoint logic must fetch those retired days and use their
 * label/day_index/day_type for matching.
 *
 *   npm run test:old-block-days
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
    old_day_label: null,
    old_day_index: null,
    has_sets: false,
    ...overrides,
  };
}

function day(
  id: string,
  day_index: number,
  day_type: "weights" | "bodyweight" | "rest",
  label: string | null = null,
): NewDay {
  return { id, day_index, day_type, label };
}

console.log("\nX8/X9/X16: Session pointing to old block's 'Lower' day matches new block's 'Lower'");
{
  // Session from old block points to a retired day with label="Lower", day_index=2
  // The repoint function must have fetched that retired day and extracted its label/index
  const sessions = [
    session("s1", "2026-10-24", {
      actual_type: "weights",
      old_day_label: "Lower", // From the RETIRED block's day
      old_day_index: 2,
      has_sets: false,
    }),
  ];

  const newDays = [
    day("new-upper", 1, "weights", "Upper"),
    day("new-lower", 2, "weights", "Lower"),
  ];

  const { toRebuild } = planRepointSessions(sessions, newDays, "2026-10-24");

  check("session is repointed", toRebuild.length === 1);
  check("matched by label to new Lower", toRebuild[0]?.newProgramDayId === "new-lower");
}

console.log("\nX16: Old day's day_index is used for matching when label is null");
{
  // Old block's day had no label, but day_index=3
  const sessions = [
    session("s1", "2026-10-24", {
      actual_type: "weights",
      old_day_label: null, // Old day had no label
      old_day_index: 3, // But it was day 3
      has_sets: false,
    }),
  ];

  const newDays = [
    day("new-day-1", 1, "weights", "Upper"),
    day("new-day-2", 2, "weights", "Lower"),
    day("new-day-3", 3, "weights", "Push"),
  ];

  const { toRebuild } = planRepointSessions(sessions, newDays, "2026-10-24");

  check("session is repointed", toRebuild.length === 1);
  check("matched by day_index to new day 3", toRebuild[0]?.newProgramDayId === "new-day-3");
}

console.log("\nX8/X9: Old day's day_type is used for fallback matching");
{
  // Old block's day was "weights" type, but new block has different labels/indices
  const sessions = [
    session("s1", "2026-10-24", {
      actual_type: "weights",
      old_day_label: "Old Label", // Won't match
      old_day_index: 5, // Won't match
      has_sets: false,
    }),
  ];

  const newDays = [
    day("new-day-1", 1, "weights", "Different Label"),
  ];

  const { toRebuild } = planRepointSessions(sessions, newDays, "2026-10-24");

  check("session is repointed", toRebuild.length === 1);
  check("matched by type fallback", toRebuild[0]?.newProgramDayId === "new-day-1");
}

if (failures > 0) {
  console.log(`\n❌ ${failures} failure(s)`);
  process.exit(1);
} else {
  console.log("\n✅ All checks passed");
}
