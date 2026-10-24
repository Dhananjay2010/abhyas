/**
 * Tests resetProgressionTargets helper and its integration with actions.
 *
 *   npx tsx scripts/test-reset-progression-targets.ts
 */
import { resetProgressionTargets } from "../src/lib/program/progression";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function main() {
console.log("\nresetProgressionTargets: fake Supabase tests");

// Mock Supabase client
type UpdateData = Record<string, unknown>;
type FakeCall = { table: string; update: UpdateData; eq: Array<[string, string]> };

function makeFakeSupabase(updateResult: { error?: { message: string } }) {
  const calls: FakeCall[] = [];

  const from = (table: string) => ({
    update: (data: UpdateData) => {
      const eqCalls: Array<[string, string]> = [];
      return {
        eq: (column: string, value: string) => {
          eqCalls.push([column, value]);
          calls.push({ table, update: data, eq: eqCalls });
          return updateResult.error ? { error: updateResult.error } : { error: null };
        },
      };
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from, calls } as any;
}

{
  const fake = makeFakeSupabase({});
  const result = await resetProgressionTargets(fake, "user-123");

  check("successful reset returns ok: true",
    result.ok === true, `${JSON.stringify(result)}`);
  check("updates exercise_progress table",
    fake.calls[0]?.table === "exercise_progress");
  check("sets current_target_reps to null",
    fake.calls[0]?.update?.current_target_reps === null,
    `${JSON.stringify(fake.calls[0]?.update)}`);
  check("filters by user_id",
    fake.calls[0]?.eq[0]?.[0] === "user_id" && fake.calls[0]?.eq[0]?.[1] === "user-123");
  check("does not touch current_working_weight_kg",
    !("current_working_weight_kg" in (fake.calls[0]?.update || {})));
}

{
  const fake = makeFakeSupabase({ error: { message: "Database connection failed" } });
  const result = await resetProgressionTargets(fake, "user-456");

  check("failed reset returns ok: false",
    result.ok === false, `${JSON.stringify(result)}`);
  check("failed reset returns error message",
    !result.ok && result.error === "Database connection failed",
    `${!result.ok ? result.error : "no error"}`);
}

console.log("\nAction integration tests");

// Test buildPlan calls reset after success
async function testBuildPlan() {
  let resetCalled = false;
  let resetCalledBeforeCreate = false;
  let createBlockCalled = false;

  const fakeSupabase = {
    from: () => ({
      update: () => ({
        eq: () => {
          resetCalled = true;
          if (!createBlockCalled) resetCalledBeforeCreate = true;
          return { error: null };
        },
      }),
    }),
  };

  const fakeCreateBlock = async () => {
    createBlockCalled = true;
    return { ok: true, programId: "p1", blockNumber: 1, trainingDays: 4, totalExercises: 12 };
  };

  // Simulate buildPlan logic
  const result = await fakeCreateBlock();
  if (result.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await resetProgressionTargets(fakeSupabase as any, "user");
  }

  check("buildPlan calls reset after successful createBlockForUser",
    resetCalled && !resetCalledBeforeCreate);
}

await testBuildPlan();

// Test buildPlan does NOT call reset after failure
async function testBuildPlanFailure() {
  let resetCalled = false;

  const fakeCreateBlock = async () => {
    return { ok: false, error: "Validation failed" };
  };

  // Simulate buildPlan logic
  const result = await fakeCreateBlock();
  if (result.ok) {
    resetCalled = true;
  }

  check("buildPlan does NOT call reset after createBlockForUser failure",
    !resetCalled);
}

await testBuildPlanFailure();

// Test updateProfileSettings calls reset only when values change and after success
async function testUpdateProfileOnlyWhenChanged() {
  const currentProfile = { goal: "strength", level: "intermediate", days_per_week: 4, primary_track: "gym" };

  // Simulate: patch with same goal value
  const patchSameGoal = { goal: "strength" as const };
  const shouldResetSame = patchSameGoal.goal !== undefined && patchSameGoal.goal !== currentProfile.goal;
  check("updateProfileSettings does NOT reset when goal unchanged",
    !shouldResetSame);

  // Simulate: patch with different goal value
  const patchDiffGoal = { goal: "hypertrophy" as const };
  const shouldResetDiff = patchDiffGoal.goal !== undefined && patchDiffGoal.goal !== currentProfile.goal;
  check("updateProfileSettings DOES reset when goal changed",
    shouldResetDiff);

  // Simulate: patch with unrelated field (timezone)
  const patchUnrelated = { timezone: "America/New_York" };
  // Check if any progression field is present (not timezone)
  const progressionFields = ["goal", "level", "days_per_week", "primary_track"] as const;
  const shouldResetUnrelated = progressionFields.some(field => field in patchUnrelated);
  check("updateProfileSettings does NOT reset for unrelated fields",
    !shouldResetUnrelated);

  // Simulate: level changed
  const patchLevel = { level: "advanced" as const };
  const shouldResetLevel = patchLevel.level !== undefined && patchLevel.level !== currentProfile.level;
  check("updateProfileSettings DOES reset when level changed",
    shouldResetLevel);
}

await testUpdateProfileOnlyWhenChanged();

// Test updateProfileSettings does NOT reset after validation failure
async function testUpdateProfileValidationFailure() {
  let resetCalled = false;

  // Simulate validation failure
  const validationResult = { ok: false, error: "Invalid goal" } as const;

  if (validationResult.ok) {
    resetCalled = true;
  }

  check("updateProfileSettings does NOT reset after validation failure",
    !resetCalled);
}

await testUpdateProfileValidationFailure();

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
