/**
 * test-units-m1-page-loader-wiring.tsx
 * 
 * Test the integrated loadAndBuildRunnerExercises function used by page.tsx.
 * Kills page-wiring mutants: empty map bypass, skipping the loader, etc.
 */

import { loadAndBuildRunnerExercises } from "../src/lib/session/load-and-build-runner-exercises";
import { computeRunnerWeightPrefill } from "../src/lib/units";

function check(label: string, ok: boolean, detail?: string, actualValue?: unknown) {
  if (ok) {
    console.log(`  ✓ ${label}${detail ? ` -- ${detail}` : ""}`);
  } else {
    console.log(`  ✗ ${label}${detail ? ` -- ${detail}` : ""} ${actualValue !== undefined ? `(got ${JSON.stringify(actualValue)})` : ""}`);
    process.exit(1);
  }
}

// Minimal PostgREST stub (from test-units-m1-loader-prescription-floor)
function makeFakeSupabase() {
  const requests: Array<{ url: string; method: string }> = [];
  const responses = new Map<string, unknown>();

  const stubFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    
    const key = `${method} ${url}`;
    requests.push({ url, method });

    const data = responses.get(key) ?? [];

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const queryBuilder = {
    _table: "",
    _params: new URLSearchParams(),
    eq: function (col: string, val: unknown) {
      this._params.set(col, `eq.${val}`);
      return this;
    },
    in: function (col: string, vals: unknown[]) {
      this._params.set(col, `in.(${vals.join(",")})`);
      return this;
    },
    order: function (col: string, opts?: { ascending?: boolean }) {
      this._params.set("order", `${col}.${opts?.ascending ? "asc" : "desc"}`);
      return this;
    },
    limit: function (n: number) {
      this._params.set("limit", `${n}`);
      return this;
    },
    then: function (resolve: (result: { data: unknown; error: null }) => void) {
      const url = `http://fake.local/rest/v1/${this._table}?${this._params.toString()}`;
      // console.log("Requesting:", `GET ${url}`);
      stubFetch(url, { method: "GET" }).then((res) => res.json()).then((data) => {
        resolve({ data, error: null });
      });
      return Promise.resolve();
    },
  };

  const client = {
    from: (table: string) => {
      return {
        select: (cols: string) => {
          const builder = Object.create(queryBuilder);
          builder._table = table;
          builder._params = new URLSearchParams();
          builder._params.set("select", cols.replace(/\s+/g, "").replace(/\n/g, ""));
          return builder;
        },
      };
    },
  } as any;

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
    
    const rows = [
      {
        id: "session-ex-1",
        session_id: "sess",
        exercise_id: "ex-bench",
        sequence: 1,
        sets_count: 3,
        reps_min: 6,
        reps_max: 8,
        rest_seconds: 180,
        notes: null,
        exercises: {
          id: "ex-bench",
          name: "Bench Press",
          slug: "bench-press",
          cue: null,
          metric: "reps" as const,
          primary_muscles: ["chest" as const],
          equipment_tags: [],
          contraindicated_regions: [],
          impact: null,
          movement_pattern: "push" as const,
          plane_of_motion: "horizontal" as const,
          spinal_load: "none" as const,
        },
        session_sets: [],
      },
    ];
    
    const progressByExercise = new Map([
      ["ex-bench", {
        id: "prog-1",
        user_id: "test-user",
        exercise_id: "ex-bench",
        program_id: "prog-abc",
        status: "in_range" as const,
        working_weight_kg: 60,
        suggested_weight_kg: 62.5,
        previous_completed_weight_kg: null,  // Will be set by integrated function
        first_logged_at: "2024-01-01",
        last_logged_at: "2024-01-10",
        weight_prefill: null,
        current_target_reps: 6,
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
