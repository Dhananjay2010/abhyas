/**
 * Test override detection logic (Item 3).
 *
 * After a rebuild, sessions are repointed to the new block's days. The Today
 * page must distinguish between:
 * - Normal schedule: user followed the plan (or a repointed session on the right day)
 * - Override: user intentionally chose a different type or weekday
 *
 *   npm run test:detect-override
 */
import { isSessionOverride } from "../src/lib/program/detect-override";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n(a) Scheduled day after rebuild with no planned row (not an override)");
{
  // Scenario: Tuesday in new block is Lower. No session exists (just following schedule).
  const override = undefined;
  const overrideDay = undefined;
  const scheduled = { id: "new-lower", day_index: 2, day_type: "weights" as const };
  const todayWeekday = 2; // Tuesday

  const result = isSessionOverride(override, overrideDay, scheduled, todayWeekday);

  check("no session = not an override", result === false);
}

console.log("\n(a2) Scheduled day after rebuild with repointed session on correct weekday");
{
  // Scenario: Old block had Lower on Tuesday. Rebuild happened. New block has
  // Lower on Tuesday. The in_progress session was repointed to new Lower day.
  // Tuesday viewing: should NOT show as override (user is just continuing).
  const override = { actual_type: "weights" as const };
  const overrideDay = { id: "new-lower", day_index: 2, day_type: "weights" as const };
  const scheduled = { id: "new-lower", day_index: 2, day_type: "weights" as const };
  const todayWeekday = 2; // Tuesday

  const result = isSessionOverride(override, overrideDay, scheduled, todayWeekday);

  check("repointed session on same weekday = not an override", result === false);
}

console.log("\n(b) Real train-anyway choice: rest day, user chose weights");
{
  // Scenario: Tuesday is Rest in the block. User chose "Train anyway: Upper".
  // The session's actual_type is weights, but scheduled says rest.
  const override = { actual_type: "weights" as const };
  const overrideDay = { id: "upper-day", day_index: 1, day_type: "weights" as const };
  const scheduled = { id: "rest-day", day_index: 2, day_type: "rest" as const };
  const todayWeekday = 2; // Tuesday

  const result = isSessionOverride(override, overrideDay, scheduled, todayWeekday);

  check("train-anyway (type differs) = override", result === true);
}

console.log("\n(b2) Real train-anyway choice: rest day, user chose bodyweight");
{
  // Scenario: Monday is Rest. User chose "Train anyway: Full Body".
  const override = { actual_type: "bodyweight" as const };
  const overrideDay = { id: "full-body", day_index: 1, day_type: "bodyweight" as const };
  const scheduled = { id: "rest-day", day_index: 1, day_type: "rest" as const };
  const todayWeekday = 1; // Monday

  const result = isSessionOverride(override, overrideDay, scheduled, todayWeekday);

  check("train-anyway bodyweight on rest = override", result === true);
}

console.log("\n(c) Repointed planned choice: different weekday");
{
  // Scenario: Old block Monday=Upper, Tuesday=Lower. User planned Upper for Tuesday
  // ("train anyway"). Rebuild happened. New block Monday=Upper, Tuesday=Lower.
  // Repoint matched by label, so session points to new Upper (day_index=1).
  // But session's local_date is still Tuesday. Viewing on Tuesday should show override.
  const override = { actual_type: "weights" as const };
  const overrideDay = { id: "new-upper", day_index: 1, day_type: "weights" as const };
  const scheduled = { id: "new-lower", day_index: 2, day_type: "weights" as const };
  const todayWeekday = 2; // Tuesday

  const result = isSessionOverride(override, overrideDay, scheduled, todayWeekday);

  check("repointed train-anyway (day_index differs) = override", result === true);
}

console.log("\n(c2) Repointed to matching weekday after split change");
{
  // Scenario: Old 4-day Upper/Lower. Tuesday was Lower. User followed the plan.
  // Rebuild to 5-day PPL. New Tuesday is Pull (day_index=2, type=weights).
  // Repoint matched by type, session now points to Pull.
  // Viewing on Tuesday: same type, same weekday = not an override.
  const override = { actual_type: "weights" as const };
  const overrideDay = { id: "new-pull", day_index: 2, day_type: "weights" as const };
  const scheduled = { id: "new-pull", day_index: 2, day_type: "weights" as const };
  const todayWeekday = 2; // Tuesday

  const result = isSessionOverride(override, overrideDay, scheduled, todayWeekday);

  check("repointed to new split, same weekday = not an override", result === false);
}

console.log("\n(d) Rest override on training day");
{
  // Scenario: Monday is Upper. User chose Rest.
  const override = { actual_type: "rest" as const };
  const overrideDay = undefined; // rest has no program_day
  const scheduled = { id: "upper-day", day_index: 1, day_type: "weights" as const };
  const todayWeekday = 1; // Monday

  const result = isSessionOverride(override, overrideDay, scheduled, todayWeekday);

  check("rest on training day = override", result === true);
}

console.log("\n(e) Yoga override on training day");
{
  // Scenario: Tuesday is Lower. User chose Yoga.
  const override = { actual_type: "yoga" as const };
  const overrideDay = undefined; // yoga has no program_day
  const scheduled = { id: "lower-day", day_index: 2, day_type: "weights" as const };
  const todayWeekday = 2; // Tuesday

  const result = isSessionOverride(override, overrideDay, scheduled, todayWeekday);

  check("yoga on training day = override", result === true);
}

console.log("\n(f) Edge case: overrideDay missing but type matches");
{
  // Scenario: session exists but its program_day wasn't found (shouldn't happen).
  // If the type matches, we say not an override (safe default).
  const override = { actual_type: "weights" as const };
  const overrideDay = undefined;
  const scheduled = { id: "lower-day", day_index: 2, day_type: "weights" as const };
  const todayWeekday = 2; // Tuesday

  const result = isSessionOverride(override, overrideDay, scheduled, todayWeekday);

  check("missing overrideDay, type matches = not override", result === false);
}

console.log("\n(g) Edge case: no scheduled day");
{
  // Scenario: viewing Today but profile has no active block (shouldn't happen in practice).
  const override = { actual_type: "weights" as const };
  const overrideDay = { id: "upper-day", day_index: 1, day_type: "weights" as const };
  const scheduled = undefined;
  const todayWeekday = 1;

  const result = isSessionOverride(override, overrideDay, scheduled, todayWeekday);

  check("no scheduled day, type null vs weights = override", result === true);
}

if (failures > 0) {
  console.log(`\n❌ ${failures} failure(s)`);
  process.exit(1);
} else {
  console.log("\n✅ All checks passed");
}
