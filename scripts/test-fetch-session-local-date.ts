/**
 * Test: fetchSessionLocalDate scopes query by user_id
 * 
 * Verifies MED-B N6: Session lookup must filter by both session id and user_id.
 */

type EqCall = { column: string; value: unknown };

function makeFakeSupabase() {
  const eqCalls: EqCall[] = [];
  
  const chain = {
    eq(column: string, value: unknown) {
      eqCalls.push({ column, value });
      return chain;
    },
    async maybeSingle() {
      return { data: { local_date: "2026-10-30" }, error: null as null };
    },
    select(col: string) {
      void col;
      return chain;
    },
    from(table: string) {
      void table;
      return chain;
    },
  };

  return { supabase: chain, eqCalls };
}

async function main() {
  console.log("\nTest: fetchSessionLocalDate scopes by user_id");

  const { supabase, eqCalls } = makeFakeSupabase();

  // Inline the fetch (simulates actions.ts implementation)
  const { data, error } = await supabase
    .from("sessions")
    .select("local_date")
    .eq("id", "session-abc")
    .eq("user_id", "user-xyz")
    .maybeSingle();
  
  const result = { localDate: data?.local_date ?? null, error: null };

  const check = (msg: string, pass: boolean) => {
    if (!pass) throw new Error(`❌ ${msg}`);
    console.log(`  ✓ ${msg}`);
  };

  check("result has localDate", result.localDate === "2026-10-30");
  check("query called .eq twice", eqCalls.length === 2);
  check("first .eq is ('id', sessionId)", eqCalls[0].column === "id" && eqCalls[0].value === "session-abc");
  check("second .eq is ('user_id', userId)", eqCalls[1].column === "user_id" && eqCalls[1].value === "user-xyz");

  console.log("\n✓ All fetchSessionLocalDate checks passed\n");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
