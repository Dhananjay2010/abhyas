#!/usr/bin/env tsx
/**
 * M1: Behavioral test for loadPreviousCompletedWeights and runner prefill logic.
 * 
 * Tests with a real createClient and stubFetch to verify actual query behavior:
 * (a) previous session 60 kg, now prescribed 62.5 kg → an increase (floors to 137.5 lb);
 * (b) 62.5 after 62.5 → held, 138 lb (rounds nearest);
 * (c) an OLDER session at 70 kg and the newest at 60 kg → previous = 60;
 * (d) the newest session has a warm-up at 65 kg and working sets at 60 kg → previous = 60;
 * (e) in_progress and abandoned sessions are ignored (behavioral stub);
 * (f) multiple working sets of different weights (55 and 60) → max = 60 (mutant H2).
 *
 *   npx tsx scripts/test-units-m1-loader-prescription-floor.tsx
 */

import { createClient } from "@supabase/supabase-js";
import { loadPreviousCompletedWeights } from "../src/lib/session/load-previous-weights";
import { computeRunnerWeightPrefill } from "../src/lib/units";
import type { Database } from "../src/lib/database.types";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = "", actual?: unknown) {
  if (ok) {
    console.log(`  ok   ${label}${detail ? `  -- ${detail}` : ""}`);
    passed++;
  } else {
    console.error(`❌ ${label}${actual !== undefined ? ` -- got: ${JSON.stringify(actual)}` : detail ? `  -- ${detail}` : ""}`);
    failed++;
  }
}

type RecordedRequest = {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
};

function makeFakeSupabase() {
  const requests: RecordedRequest[] = [];
  const responses: Map<string, unknown> = new Map();

  const stubFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    
    let body: unknown = null;
    if (init?.body) {
      if (typeof init.body === "string") {
        body = JSON.parse(init.body);
      }
    }
    
    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((value, key) => {
          headers[key.toLowerCase()] = value;
        });
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(([key, value]) => {
          headers[key.toLowerCase()] = value;
        });
      } else {
        Object.entries(init.headers).forEach(([key, value]) => {
          if (typeof value === "string") {
            headers[key.toLowerCase()] = value;
          }
        });
      }
    }

    requests.push({ url, method, body, headers });

    // Look up response
    const key = `${method} ${url}`;
    const data = responses.get(key) ?? [];

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json", "Content-Range": `0-${Array.isArray(data) ? data.length - 1 : 0}/${Array.isArray(data) ? data.length : 1}` },
    });
  };

  const client = createClient<Database>("http://fake.local", "anon", {
    auth: { persistSession: false },
    global: { fetch: stubFetch },
  });

  return { client, requests, responses };
}

async function runTests() {
  console.log("\nM1: loadPreviousCompletedWeights and runner prefill behavioral tests\n");

  const userId = "user-1";
  const ex1 = "ex-1";
  const ex2 = "ex-2";
  const ex3 = "ex-3";
  const ex4 = "ex-4";
  const ex5 = "ex-5";
  const ex6 = "ex-6";

  // Case (a): previous session 60 kg, now prescribed 62.5 kg → an increase
  console.log("(a) previous session 60 kg, now prescribed 62.5 kg → increase");
  {
    const { client, responses } = makeFakeSupabase();
    
    responses.set("GET http://fake.local/rest/v1/sessions?select=id%2Clocal_date%2Cstarted_at%2Csession_exercises%21inner%28exercise_id%2Csession_sets%21inner%28weight_kg%2Cis_warmup_set%29%29&user_id=eq.user-1&status=eq.completed&session_exercises.exercise_id=in.%28ex-1%29&order=started_at.desc&limit=100", [
      {
        id: "sess-1",
        local_date: "2024-01-10",
        started_at: "2024-01-10T10:00:00Z",
        session_exercises: [
          {
            exercise_id: ex1,
            session_sets: [
              { weight_kg: 60, is_warmup_set: false },
              { weight_kg: 60, is_warmup_set: false },
              { weight_kg: 60, is_warmup_set: false },
            ],
          },
        ],
      },
    ]);

    const result = await loadPreviousCompletedWeights(client, userId, [ex1]);
    const previous = result.get(ex1);
    check("returns previous weight 60 kg", previous === 60, "", previous);

    // Use loader result to determine if prescribed increase: suggested 62.5 > previous 60 + 0.01
    const suggested = 62.5;
    const isPrescribed = previous !== null && previous !== undefined && suggested > previous + 0.01;
    check("isPrescribedIncrease: 62.5 > 60", isPrescribed === true);
    
    // Runner prefill with prescribed increase floors to 137.5 lb
    const prefill = computeRunnerWeightPrefill(suggested, "imperial", false, isPrescribed);
    check("runner prefills 137.5 lb (floors)", prefill === "137.5", `got "${prefill}"`);
  }

  // Case (b): 62.5 after 62.5 → held, 138 lb
  console.log("\n(b) 62.5 after 62.5 → held, rounds to nearest 138 lb");
  {
    const { client, responses } = makeFakeSupabase();
    
    responses.set("GET http://fake.local/rest/v1/sessions?select=id%2Clocal_date%2Cstarted_at%2Csession_exercises%21inner%28exercise_id%2Csession_sets%21inner%28weight_kg%2Cis_warmup_set%29%29&user_id=eq.user-2&status=eq.completed&session_exercises.exercise_id=in.%28ex-2%29&order=started_at.desc&limit=100", [
      {
        id: "sess-2",
        local_date: "2024-01-10",
        started_at: "2024-01-10T10:00:00Z",
        session_exercises: [
          {
            exercise_id: ex2,
            session_sets: [
              { weight_kg: 62.5, is_warmup_set: false },
            ],
          },
        ],
      },
    ]);

    const result = await loadPreviousCompletedWeights(client, "user-2", [ex2]);
    const previous = result.get(ex2);
    check("returns previous weight 62.5 kg", previous === 62.5, "", previous);

    // Use loader result: suggested 62.5 NOT > previous 62.5 + 0.01 → held weight
    const suggested = 62.5;
    const isPrescribed = previous !== null && previous !== undefined && suggested > previous + 0.01;
    check("isPrescribedIncrease false: 62.5 !> 62.5", isPrescribed === false);
    
    // Runner prefill with held weight rounds to nearest 138 lb
    const prefill = computeRunnerWeightPrefill(suggested, "imperial", false, isPrescribed);
    check("runner prefills 138 lb (rounds nearest)", prefill === "138", `got "${prefill}"`);
  }

  // Case (c): older session at 70 kg, newest at 60 kg → previous = 60
  console.log("\n(c) older session at 70 kg, newest at 60 kg → previous = 60");
  {
    const { client, responses } = makeFakeSupabase();
    
    responses.set("GET http://fake.local/rest/v1/sessions?select=id%2Clocal_date%2Cstarted_at%2Csession_exercises%21inner%28exercise_id%2Csession_sets%21inner%28weight_kg%2Cis_warmup_set%29%29&user_id=eq.user-3&status=eq.completed&session_exercises.exercise_id=in.%28ex-3%29&order=started_at.desc&limit=100", [
      {
        id: "sess-newest",
        local_date: "2024-01-15",
        started_at: "2024-01-15T10:00:00Z",
        session_exercises: [
          {
            exercise_id: ex3,
            session_sets: [
              { weight_kg: 60, is_warmup_set: false },
            ],
          },
        ],
      },
      {
        id: "sess-older",
        local_date: "2024-01-10",
        started_at: "2024-01-10T10:00:00Z",
        session_exercises: [
          {
            exercise_id: ex3,
            session_sets: [
              { weight_kg: 70, is_warmup_set: false },
            ],
          },
        ],
      },
    ]);

    const result = await loadPreviousCompletedWeights(client, "user-3", [ex3]);
    check("returns most recent weight 60 kg (not 70 kg)", result.get(ex3) === 60, "", result.get(ex3));
  }

  // Case (d): newest session has warm-up at 65 kg and working sets at 60 kg → previous = 60
  console.log("\n(d) newest session: warm-up at 65 kg, working sets at 60 kg → previous = 60");
  {
    const { client, responses } = makeFakeSupabase();
    
    responses.set("GET http://fake.local/rest/v1/sessions?select=id%2Clocal_date%2Cstarted_at%2Csession_exercises%21inner%28exercise_id%2Csession_sets%21inner%28weight_kg%2Cis_warmup_set%29%29&user_id=eq.user-4&status=eq.completed&session_exercises.exercise_id=in.%28ex-4%29&order=started_at.desc&limit=100", [
      {
        id: "sess-4",
        local_date: "2024-01-10",
        started_at: "2024-01-10T10:00:00Z",
        session_exercises: [
          {
            exercise_id: ex4,
            session_sets: [
              { weight_kg: 65, is_warmup_set: true },  // Warmup should be ignored
              { weight_kg: 60, is_warmup_set: false },
              { weight_kg: 60, is_warmup_set: false },
            ],
          },
        ],
      },
    ]);

    const result = await loadPreviousCompletedWeights(client, "user-4", [ex4]);
    check("returns working weight 60 kg (ignores 65 kg warm-up)", result.get(ex4) === 60, "", result.get(ex4));
  }

  // Case (e): PostgREST status=completed filter prevents in_progress sessions
  console.log("\n(e) status=completed filter in query");
  {
    const { client, requests, responses } = makeFakeSupabase();
    
    // Stub honors PostgREST filter: only returns completed session
    responses.set("GET http://fake.local/rest/v1/sessions?select=id%2Clocal_date%2Cstarted_at%2Csession_exercises%21inner%28exercise_id%2Csession_sets%21inner%28weight_kg%2Cis_warmup_set%29%29&user_id=eq.user-5&status=eq.completed&session_exercises.exercise_id=in.%28ex-5%29&order=started_at.desc&limit=100", [
      // Only the completed session at 60 kg is returned
      // (An in_progress session at 70 kg would not be returned by PostgREST)
      {
        id: "sess-completed",
        local_date: "2024-01-10",
        started_at: "2024-01-10T10:00:00Z",
        session_exercises: [
          {
            exercise_id: ex5,
            session_sets: [
              { weight_kg: 60, is_warmup_set: false },
            ],
          },
        ],
      },
    ]);

    const result = await loadPreviousCompletedWeights(client, "user-5", [ex5]);
    check("returns 60 kg (completed)", result.get(ex5) === 60, "", result.get(ex5));
    
    // Verify query included status=completed filter
    check("query includes status=completed filter", 
      requests.some(r => r.url.includes("status=eq.completed")));
  }

  // Case (f): multiple working sets of different weights (55 and 60) → max = 60 (Mutant H2)
  console.log("\n(f) multiple working sets with different weights → max weight");
  {
    const { client, responses } = makeFakeSupabase();
    
    responses.set("GET http://fake.local/rest/v1/sessions?select=id%2Clocal_date%2Cstarted_at%2Csession_exercises%21inner%28exercise_id%2Csession_sets%21inner%28weight_kg%2Cis_warmup_set%29%29&user_id=eq.user-6&status=eq.completed&session_exercises.exercise_id=in.%28ex-6%29&order=started_at.desc&limit=100", [
      {
        id: "sess-6",
        local_date: "2024-01-10",
        started_at: "2024-01-10T10:00:00Z",
        session_exercises: [
          {
            exercise_id: ex6,
            session_sets: [
              { weight_kg: 55, is_warmup_set: false },
              { weight_kg: 60, is_warmup_set: false },
              { weight_kg: 55, is_warmup_set: false },
            ],
          },
        ],
      },
    ]);

    const result = await loadPreviousCompletedWeights(client, "user-6", [ex6]);
    check("Mutant H2: returns max weight 60 kg (not min 55)", result.get(ex6) === 60, "", result.get(ex6));
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
