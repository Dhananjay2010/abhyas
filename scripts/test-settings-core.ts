/**
 * Test settings action core with fake Supabase
 *
 *   npm run test:settings-core
 */
import { FakeSupabaseClient } from "../src/lib/test-helpers/fake-supabase";
import { updateProfileCore } from "../src/lib/settings/update-profile-core";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

async function runTests() {
console.log("\nSettings core: resets on goal change (O10)");
{
  const fake = new FakeSupabaseClient();
  fake.seed("profiles", [{ id: "user-1", goal: "hypertrophy", level: "intermediate", days_per_week: 4, primary_track: "barbell" }]);
  fake.seed("exercise_progress", []);

  await updateProfileCore(
    { supabase: fake as unknown as Parameters<typeof updateProfileCore>[0]["supabase"], userId: "user-1" },
    { goal: "strength" }
  );

  const progressCalls = fake.getCalls().filter((c) => c.table === "exercise_progress" && c.method === "update");

  check("O10: goal change triggers reset (calls exercise_progress update)", progressCalls.length > 0, `got ${progressCalls.length} calls`);
}

console.log("\nSettings core: doesn't reset on non-progression changes (O10)");
{
  const fake = new FakeSupabaseClient();
  fake.seed("profiles", [{ id: "user-1", goal: "hypertrophy", level: "intermediate", days_per_week: 4, primary_track: "barbell" }]);
  fake.seed("exercise_progress", []);

  await updateProfileCore(
    { supabase: fake as unknown as Parameters<typeof updateProfileCore>[0]["supabase"], userId: "user-1" },
    { age: 30, weight_kg: 80 }
  );

  const progressCalls = fake.getCalls().filter((c) => c.table === "exercise_progress" && c.method === "update");

  check("O10: age/weight change doesn't reset", progressCalls.length === 0, `got ${progressCalls.length} calls (should be 0)`);
}

console.log("\nSettings core: resets on level change (O10)");
{
  const fake = new FakeSupabaseClient();
  fake.seed("profiles", [{ id: "user-1", goal: "hypertrophy", level: "intermediate", days_per_week: 4, primary_track: "barbell" }]);
  fake.seed("exercise_progress", []);

  await updateProfileCore(
    { supabase: fake as unknown as Parameters<typeof updateProfileCore>[0]["supabase"], userId: "user-1" },
    { level: "advanced" }
  );

  const progressCalls = fake.getCalls().filter((c) => c.table === "exercise_progress" && c.method === "update");

  check("O10: level change triggers reset", progressCalls.length > 0);
}

console.log("\nSettings core: resets on days_per_week change (O10)");
{
  const fake = new FakeSupabaseClient();
  fake.seed("profiles", [{ id: "user-1", goal: "hypertrophy", level: "intermediate", days_per_week: 4, primary_track: "barbell" }]);
  fake.seed("exercise_progress", []);

  await updateProfileCore(
    { supabase: fake as unknown as Parameters<typeof updateProfileCore>[0]["supabase"], userId: "user-1" },
    { days_per_week: 3 }
  );

  const progressCalls = fake.getCalls().filter((c) => c.table === "exercise_progress" && c.method === "update");

  check("O10: days_per_week change triggers reset", progressCalls.length > 0);
}

console.log("\nSettings core: resets on primary_track change (O10)");
{
  const fake = new FakeSupabaseClient();
  fake.seed("profiles", [{ id: "user-1", goal: "hypertrophy", level: "intermediate", days_per_week: 4, primary_track: "barbell" }]);
  fake.seed("exercise_progress", []);

  await updateProfileCore(
    { supabase: fake as unknown as Parameters<typeof updateProfileCore>[0]["supabase"], userId: "user-1" },
    { primary_track: "kettlebell" }
  );

  const progressCalls = fake.getCalls().filter((c) => c.table === "exercise_progress" && c.method === "update");

  check("O10: primary_track change triggers reset", progressCalls.length > 0);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
}

runTests();
