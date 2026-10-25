/**
 * Test supabaseCloseStaleQueries adapter wiring: ensures .eq("status", guardStatus)
 * and { count: "exact" } are present (ad1, ad2).
 * 
 *   npx tsx scripts/test-supabase-adapter.ts
 */

import { supabaseCloseStaleQueries, type SessionExerciseRow } from "../src/lib/session/close-stale-deps";

type CallRecord = {
  table?: string;
  select?: string;
  updateData?: Record<string, unknown>;
  updateOptions?: { count?: string };
  eqColumn?: string;
  eqValue?: unknown;
  inColumn?: string;
  inValues?: unknown[];
};

class RecordingSupabaseClient {
  private calls: CallRecord[] = [];
  
  getCalls(): CallRecord[] {
    return this.calls;
  }

  from(table: string) {
    const call: CallRecord = { table };
    this.calls.push(call);
    
    return {
      select: (columns: string) => {
        call.select = columns;
        return {
          in: (column: string, values: string[]) => {
            call.inColumn = column;
            call.inValues = values;
            return Promise.resolve({ 
              data: [] as SessionExerciseRow[], 
              error: null 
            });
          }
        };
      },
      update: (data: Record<string, unknown>, options?: { count?: string }) => {
        call.updateData = data;
        call.updateOptions = options;
        return {
          eq: (column: string, value: unknown) => {
            call.eqColumn = column;
            call.eqValue = value;
            return {
              eq: (column2: string, value2: unknown) => {
                // Record the status guard
                if (column2 === "status") {
                  call.eqValue = value2;
                }
                return Promise.resolve({ error: null, count: 1 });
              }
            };
          }
        };
      }
    };
  }
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {

console.log("\n1. ad1: updateSessionIfStatus passes guardStatus to .eq");
{
  const client = new RecordingSupabaseClient();
  const adapter = supabaseCloseStaleQueries(client as any);
  
  await adapter.updateSessionIfStatus("sess1", "in_progress", { status: "completed" });
  
  const calls = client.getCalls();
  check("table is sessions", calls[0].table === "sessions");
  check("ad1: status guard is in_progress", calls[0].eqValue === "in_progress");
}

console.log("\n2. ad2: updateSessionIfStatus passes { count: 'exact' }");
{
  const client = new RecordingSupabaseClient();
  const adapter = supabaseCloseStaleQueries(client as any);
  
  await adapter.updateSessionIfStatus("sess2", "planned", { status: "skipped" });
  
  const calls = client.getCalls();
  check("ad2: count option is 'exact'", calls[0].updateOptions?.count === "exact");
}

console.log("\n3. selectSessionSets calls session_exercises with .in");
{
  const client = new RecordingSupabaseClient();
  const adapter = supabaseCloseStaleQueries(client as any);
  
  await adapter.selectSessionSets(["s1", "s2"]);
  
  const calls = client.getCalls();
  check("table is session_exercises", calls[0].table === "session_exercises");
  check("selects session_id and sets", calls[0].select?.includes("session_id") === true);
  check("uses .in for ids", calls[0].inColumn === "session_id");
  check("passes correct ids", JSON.stringify(calls[0].inValues) === '["s1","s2"]');
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

})();

export {};
