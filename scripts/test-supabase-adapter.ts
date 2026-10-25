/**
 * Test supabaseCloseStaleQueries adapter wiring: ensures .eq("status", guardStatus)
 * and { count: "exact" } are present (ad1, ad2).
 * 
 *   npx tsx scripts/test-supabase-adapter.ts
 */

import { createClient } from "@supabase/supabase-js";
import { supabaseCloseStaleQueries } from "../src/lib/session/close-stale-deps";
import type { Database } from "../src/lib/database.types";

type RecordedRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
};

const recorded: RecordedRequest[] = [];

function stubFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? "GET";
  const headers: Record<string, string> = {};
  
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(init.headers)) {
      for (const [key, value] of init.headers) {
        headers[key] = value;
      }
    } else {
      Object.assign(headers, init.headers);
    }
  }
  
  const body = init?.body ? String(init.body) : null;
  
  recorded.push({ url, method, headers, body });
  
  // Return empty success responses
  const emptyData: unknown[] = [];
  return Promise.resolve(
    new Response(JSON.stringify(emptyData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {

console.log("\n1. ad1: updateSessionIfStatus passes guardStatus to .eq");
{
  recorded.length = 0;
  const client = createClient<Database>("http://fake.local", "anon", { global: { fetch: stubFetch } });
  const adapter = supabaseCloseStaleQueries(client);
  
  await adapter.updateSessionIfStatus("sess1", "in_progress", { status: "completed" });
  
  check("one PATCH request", recorded.length === 1);
  check("ad1: status filter in URL", recorded[0].url.includes("status=eq.in_progress"));
  check("ad1: id filter in URL", recorded[0].url.includes("id=eq.sess1"));
  const preferHeader = recorded[0].headers["Prefer"] ?? recorded[0].headers["prefer"];
  check("ad2: Prefer count=exact header", preferHeader?.includes("count=exact") === true, `got: ${preferHeader}`);
}

console.log("\n2. ad2: updateSessionIfStatus passes { count: 'exact' } in second call");
{
  recorded.length = 0;
  const client = createClient<Database>("http://fake.local", "anon", { global: { fetch: stubFetch } });
  const adapter = supabaseCloseStaleQueries(client);
  
  await adapter.updateSessionIfStatus("sess2", "planned", { status: "skipped" });
  
  check("one PATCH request", recorded.length === 1);
  check("status filter in URL", recorded[0].url.includes("status=eq.planned"));
  const preferHeader = recorded[0].headers["Prefer"] ?? recorded[0].headers["prefer"];
  check("ad2: Prefer count=exact header", preferHeader?.includes("count=exact") === true, `got: ${preferHeader}`);
}

console.log("\n3. selectSessionSets calls session_exercises with .in");
{
  recorded.length = 0;
  const client = createClient<Database>("http://fake.local", "anon", { global: { fetch: stubFetch } });
  const adapter = supabaseCloseStaleQueries(client);
  
  await adapter.selectSessionSets(["s1", "s2"]);
  
  check("one GET request", recorded.length === 1);
  check("table is session_exercises", recorded[0].url.includes("/session_exercises"));
  check("uses .in for ids", recorded[0].url.includes("session_id=in."));
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

})();

export {};
