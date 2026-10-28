/**
 * Test: makeFetchSessionLocalDate scopes query by user_id
 * 
 * Verifies MED-B N6: Session lookup must filter by both session id and user_id.
 */

import { makeFetchSessionLocalDate, type SessionLookupClient } from "@/lib/session/fetch-session-local-date";

type EqCall = { column: string; value: unknown };

function makeFakeSupabase() {
  const eqCalls: EqCall[] = [];
  let fromTable = "";
  let selectCols = "";
  let errorToReturn: { message: string } | null = null;
  
  const chain = {
    eq(column: string, value: unknown) {
      eqCalls.push({ column, value });
      return chain;
    },
    async maybeSingle() {
      return errorToReturn
        ? { data: null, error: errorToReturn }
        : { data: { local_date: "2026-10-30" }, error: null };
    },
    select(cols: string) {
      selectCols = cols;
      return chain;
    },
    from(table: "sessions") {
      fromTable = table;
      return chain;
    },
  };

  return {
    supabase: { from: chain.from } as SessionLookupClient,
    eqCalls,
    getFromTable: () => fromTable,
    getSelectCols: () => selectCols,
    setError: (msg: string) => { errorToReturn = { message: msg }; },
  };
}

async function main() {
  console.log("\nTest: makeFetchSessionLocalDate scopes by user_id");

  const check = (msg: string, pass: boolean) => {
    if (!pass) throw new Error(`❌ ${msg}`);
    console.log(`  ✓ ${msg}`);
  };

  console.log("\nCase 1: Success path with both .eq calls");
  {
    const { supabase, eqCalls, getFromTable, getSelectCols } = makeFakeSupabase();
    const fetch = makeFetchSessionLocalDate(supabase);
    const result = await fetch("session-abc", "user-xyz");

    check("from('sessions') called", getFromTable() === "sessions");
    check("select('local_date') called", getSelectCols() === "local_date");
    check("result has localDate", result.localDate === "2026-10-30");
    check("query called .eq twice", eqCalls.length === 2);
    check("first .eq is ('id', sessionId)", eqCalls[0].column === "id" && eqCalls[0].value === "session-abc");
    check("second .eq is ('user_id', userId)", eqCalls[1].column === "user_id" && eqCalls[1].value === "user-xyz");
    check("no error", result.error === null);
  }

  console.log("\nCase 2: Error mapping");
  {
    const { supabase, setError } = makeFakeSupabase();
    setError("network timeout");
    const fetch = makeFetchSessionLocalDate(supabase);
    const result = await fetch("session-123", "user-456");

    check("localDate is null on error", result.localDate === null);
    check("error message mapped", result.error === "network timeout");
  }

  console.log("\n✓ All makeFetchSessionLocalDate checks passed\n");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
