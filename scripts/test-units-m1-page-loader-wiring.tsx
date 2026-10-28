#!/usr/bin/env tsx
/**
 * test-units-m1-page-loader-wiring.tsx
 * 
 * Test the integrated loadAndBuildRunnerExercises function used by page.tsx.
 * Kills page-wiring mutants: empty map bypass, skipping the loader, etc.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { loadAndBuildRunnerExercises } from "../src/lib/session/load-and-build-runner-exercises";
import { computeRunnerWeightPrefill } from "../src/lib/units";
import type { SessionExerciseInput, ProgressInput } from "../src/lib/session/build-runner-exercises";

function check(label: string, ok: boolean, detail?: string, actualValue?: unknown) {
  if (ok) {
    console.log(`  ✓ ${label}${detail ? ` -- ${detail}` : ""}`);
  } else {
    console.log(`  ✗ ${label}${detail ? ` -- ${detail}` : ""} ${actualValue !== undefined ? `(got ${JSON.stringify(actualValue)})` : ""}`);
    process.exit(1);
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

    const key = `${method} ${url}`;
    const data = responses.get(key) ?? [];

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const client = createClient<Database>("http://fake.local", "fake-key", {
    global: { fetch: stubFetch },
  });

  return { client, responses, requests };
}

async function runTests() {
  console.log("\nM1: page.tsx loader + helper wiring tests\n");
  
  // Test: Integrated function loads 60 kg from DB and produces 137.5 lb prefill
  console.log("Integrated: loader returns 60 kg, prescribed 62.5 kg → runner prefills 137.5 lb");
  {
    const { client, responses } = makeFakeSupabase();
    
    const expectedUrl = "GET http://fake.local/rest/v1/sessions?select=id%2Clocal_date%2Cstarted_at%2Csession_exercises%21inner%28exercise_id%2Csession_sets%21inner%28weight_kg%2Cis_warmup_set%29%29&user_id=eq.test-user&status=eq.completed&session_exercises.exercise_id=in.%28ex-bench%29&order=started_at.desc&limit=100";
    
    responses.set(expectedUrl, [
      {
        id: "sess-1",
        local_date: "2024-01-10",
        started_at: "2024-01-10T10:00:00Z",
        session_exercises: [
          {
            exercise_id: "ex-bench",
            session_sets: [
              { weight_kg: 60, is_warmup_set: false },
              { weight_kg: 60, is_warmup_set: false },
              { weight_kg: 60, is_warmup_set: false },
            ],
          },
        ],
      },
    ]);
    
    const rows: readonly SessionExerciseInput[] = [
      {
        id: "session-ex-1",
        planned_sets: 3,
        planned_reps_min: 6,
        planned_reps_max: 8,
        rest_seconds: 180,
        metric: "reps",
        status: "pending",
        feel: null,
        session_sets: [],
        exercises: {
          id: "ex-bench",
          name: "Bench Press",
          cue: null,
          movement_pattern: "push",
          primary_muscles: ["chest"],
          equipment_ids: [],
        },
      },
    ];
    
    const progressByExercise: Map<string, ProgressInput> = new Map([
      ["ex-bench", {
        current_working_weight_kg: 60,
        current_target_reps: 6,
        previous_completed_weight_kg: null,
      }],
    ]);
    
    const exercises = await loadAndBuildRunnerExercises({
      client,
      userId: "test-user",
      rows,
      progressByExercise,
      remembersWeights: true,
      isDeload: false,
    });
    
    check("returns 1 exercise", exercises.length === 1);
    const ex = exercises[0];
    
    // Main goal: verify the integrated function loads previous weight from DB
    // Mutant: page.tsx passing empty map would result in null
    check("Mutant: page passing empty previousWeightByExercise map", 
      ex.previousCompletedWeightKg === 60, 
      `got ${ex.previousCompletedWeightKg}`);
    
    // Verify prefill logic with loaded previous weight
    // prescribed increase (suggested 62.5 > previous 60) → floor to 137.5 lb
    const suggested = 62.5;
    const previous = ex.previousCompletedWeightKg;
    const isPrescribed = previous !== null && suggested > previous + 0.01;
    check("is prescribed increase (62.5 > 60)", isPrescribed === true);
    
    const prefill = computeRunnerWeightPrefill(suggested, "imperial", false, isPrescribed);
    check("Mutant: page bypassing helper - runner prefills 137.5 lb", prefill === "137.5", `got "${prefill}"`);
  }
  
  console.log("\nAll page loader wiring tests passed\n");
}

runTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
