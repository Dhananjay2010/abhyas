/**
 * Tests resetProgressionTargets helper and its integration with actions.
 *
 *   npx tsx scripts/test-reset-progression-targets.ts
 */
import { resetProgressionTargets } from "../src/lib/program/progression";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

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

  return {
    client: { from } as unknown as SupabaseClient<Database>,
    calls,
  };
}

{
  const { client, calls } = makeFakeSupabase({});
  const result = await resetProgressionTargets(client, "user-123");

  check("successful reset returns ok: true",
    result.ok === true, `${JSON.stringify(result)}`);
  check("updates exercise_progress table",
    calls[0]?.table === "exercise_progress");
  check("sets current_target_reps to null",
    calls[0]?.update?.current_target_reps === null,
    `${JSON.stringify(calls[0]?.update)}`);
  check("filters by user_id",
    calls[0]?.eq[0]?.[0] === "user_id" && calls[0]?.eq[0]?.[1] === "user-123");
  check("does not touch current_working_weight_kg",
    !("current_working_weight_kg" in (calls[0]?.update || {})));
}

{
  const { client } = makeFakeSupabase({ error: { message: "Database connection failed" } });
  const result = await resetProgressionTargets(client, "user-456");

  check("failed reset returns ok: false",
    result.ok === false, `${JSON.stringify(result)}`);
  check("failed reset returns error message",
    !result.ok && result.error === "Database connection failed",
    `${!result.ok ? result.error : "no error"}`);
}

console.log("\nAction integration tests");
console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
