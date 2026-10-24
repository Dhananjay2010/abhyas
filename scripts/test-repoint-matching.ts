/**
 * Mutant-killing unit tests for repoint matching logic.
 *
 * Tests the pure helpers that decide how to re-point sessions after a rebuild:
 * - matchNewDay: finds the best matching day by label → day_index → day_type
 * - decideRepointAction: decides if a session should be kept, updated, or deleted
 *
 * npm run test:repoint-matching
 */
import { matchNewDay, decideRepointAction } from "../src/lib/program/repoint-sessions";

type NewProgramDay = {
  id: string;
  day_index: number;
  day_type: "weights" | "bodyweight" | "rest";
  label: string | null;
};

type OldSession = {
  old_day_label: string | null;
  old_day_index: number | null;
  actual_type: "weights" | "bodyweight" | "rest" | null;
  planned_type: "weights" | "bodyweight" | "rest" | null;
};

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function day(
  id: string,
  day_index: number,
  day_type: "weights" | "bodyweight" | "rest",
  label: string | null = null,
): NewProgramDay {
  return { id, day_index, day_type, label };
}

function session(
  label: string | null,
  day_index: number | null,
  actual_type: "weights" | "bodyweight" | "rest" | null,
  planned_type: "weights" | "bodyweight" | "rest" | null,
): OldSession {
  return {
    old_day_label: label,
    old_day_index: day_index,
    actual_type,
    planned_type,
  };
}

console.log("\n=== matchNewDay tests ===");

console.log("\n1. Label match wins over day_index and day_type");
{
  const oldSession = session("Lower", 1, "weights", "weights");
  const newDays = [
    day("new-upper", 1, "weights", "Upper"), // Same day_index, same day_type, different label
    day("new-lower", 2, "weights", "Lower"), // Different day_index, same day_type, MATCHING LABEL
  ];
  const match = matchNewDay(oldSession, newDays);

  check("matches by label (not day_index)", match?.id === "new-lower");
}

console.log("\n2. Day_index match wins over day_type when no label match");
{
  const oldSession = session("Upper A", 1, "weights", "weights");
  const newDays = [
    day("new-upper-b", 2, "weights", "Upper B"), // Different day_index, same day_type
    day("new-lower", 1, "weights", "Lower"), // MATCHING day_index, same day_type
  ];
  const match = matchNewDay(oldSession, newDays);

  check("matches by day_index (not day_type only)", match?.id === "new-lower");
}

console.log("\n3. Day_type match as fallback when label and day_index don't match");
{
  const oldSession = session("Upper A", 1, "weights", "weights");
  const newDays = [
    day("new-full-body", 3, "weights", "Full Body"), // Different label, different day_index, MATCHING day_type
  ];
  const match = matchNewDay(oldSession, newDays);

  check("matches by day_type as fallback", match?.id === "new-full-body");
}

console.log("\n4. No match returns null");
{
  const oldSession = session("Upper", 1, "weights", "weights");
  const newDays = [
    day("new-full-body", 2, "bodyweight", "Full Body"), // Different day_index, different day_type
  ];
  const match = matchNewDay(oldSession, newDays);

  check("no match returns null", match === null);
}

console.log("\n5. Rest/yoga/meditation sessions return null (no program_day)");
{
  const restSession = session(null, 1, "rest", "weights");
  const yogaSession = session(null, 1, "yoga", "weights");
  const meditationSession = session(null, 1, "meditation", "weights");
  const newDays = [day("new-upper", 1, "weights", "Upper")];

  check("rest session returns null", matchNewDay(restSession, newDays) === null);
  check("yoga session returns null", matchNewDay(yogaSession, newDays) === null);
  check("meditation session returns null", matchNewDay(meditationSession, newDays) === null);
}

console.log("\n6. actual_type takes precedence over planned_type");
{
  const oldSession = session("Upper", 1, "weights", "rest");
  const newDays = [
    day("new-upper", 1, "weights", "Upper"),
    day("new-rest", 2, "rest", null),
  ];
  const match = matchNewDay(oldSession, newDays);

  check("matches by actual_type (weights), not planned_type (rest)", match?.id === "new-upper");
}

console.log("\n7. planned_type used when actual_type is null");
{
  const oldSession = session("Upper", 1, null, "weights");
  const newDays = [day("new-upper", 1, "weights", "Upper")];
  const match = matchNewDay(oldSession, newDays);

  check("matches by planned_type when actual_type is null", match?.id === "new-upper");
}

console.log("\n8. No type (both null) returns null");
{
  const oldSession = session("Upper", 1, null, null);
  const newDays = [day("new-upper", 1, "weights", "Upper")];
  const match = matchNewDay(oldSession, newDays);

  check("no type returns null", match === null);
}

console.log("\n9. Empty newDays array returns null");
{
  const oldSession = session("Upper", 1, "weights", "weights");
  const match = matchNewDay(oldSession, []);

  check("empty newDays returns null", match === null);
}

console.log("\n10. Multiple matches: first match wins (label > day_index > day_type)");
{
  const oldSession = session("Lower", 2, "weights", "weights");
  const newDays = [
    day("new-upper", 2, "weights", "Upper"), // Matches day_index and day_type, not label
    day("new-lower", 3, "weights", "Lower"), // MATCHES LABEL (wins)
  ];
  const match = matchNewDay(oldSession, newDays);

  check("label match wins even if later in array", match?.id === "new-lower");
}

console.log("\n=== decideRepointAction tests ===");

console.log("\n11. Sessions with logged sets are kept");
{
  const sessionWithSets = { has_sets: true, local_date: "2026-10-24" };
  const action = decideRepointAction(sessionWithSets, "2026-10-24");

  check("session with sets is kept", action === "keep");
}

console.log("\n12. Planned session today is updated");
{
  const sessionToday = { has_sets: false, local_date: "2026-10-24" };
  const action = decideRepointAction(sessionToday, "2026-10-24");

  check("planned session today is updated", action === "update");
}

console.log("\n13. Planned session in the future is updated");
{
  const futureSession = { has_sets: false, local_date: "2026-10-25" };
  const action = decideRepointAction(futureSession, "2026-10-24");

  check("planned session in future is updated", action === "update");
}

console.log("\n14. Planned session in the past is deleted");
{
  const pastSession = { has_sets: false, local_date: "2026-10-23" };
  const action = decideRepointAction(pastSession, "2026-10-24");

  check("planned session in past is deleted", action === "delete");
}

console.log("\n15. Session with sets in the past is kept (not deleted)");
{
  const pastSessionWithSets = { has_sets: true, local_date: "2026-10-23" };
  const action = decideRepointAction(pastSessionWithSets, "2026-10-24");

  check("session with sets in past is kept", action === "keep");
}

if (failures > 0) {
  console.log(`\n❌ ${failures} failure(s)`);
  process.exit(1);
} else {
  console.log("\n✅ All checks passed");
}
