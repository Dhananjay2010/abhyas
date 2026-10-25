/**
 * Test logSet validation with idempotent retry for ended sessions.
 * When a session has ended but the exact same set already exists,
 * allow the retry to succeed silently.
 * 
 *   npx tsx scripts/test-log-set-idempotent-retry.ts
 */

import { 
  validateSessionForLogSet,
  buildLogSetValidationDeps,
  type LogSetValidationDeps,
  type SessionExerciseWithStatus,
  type ExistingSetRow
} from "../src/lib/session/log-set-validation";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

class FakeLogSetValidationDeps implements LogSetValidationDeps {
  private sessionStatus: string | null = "in_progress";
  private existingSet: ExistingSetRow | null = null;
  private shouldThrowLookupSession = false;
  private shouldThrowLookupSet = false;
  
  lookupExistingSetCalled = false;

  setSessionStatus(status: string | null) {
    this.sessionStatus = status;
  }

  setExistingSet(set: ExistingSetRow | null) {
    this.existingSet = set;
  }

  setThrowLookupSession(shouldThrow: boolean) {
    this.shouldThrowLookupSession = shouldThrow;
  }

  setThrowLookupSet(shouldThrow: boolean) {
    this.shouldThrowLookupSet = shouldThrow;
  }

  async lookupSessionExercise(): Promise<SessionExerciseWithStatus | null> {
    if (this.shouldThrowLookupSession) {
      throw new Error("Lookup failed");
    }
    if (this.sessionStatus === null) {
      return null;
    }
    return {
      sessions: {
        status: this.sessionStatus,
      },
    };
  }

  async lookupExistingSet(): Promise<ExistingSetRow | null> {
    this.lookupExistingSetCalled = true;
    if (this.shouldThrowLookupSet) {
      throw new Error("Lookup failed");
    }
    return this.existingSet;
  }
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {

console.log("\n1. in_progress session makes no lookupExistingSet call");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionStatus("in_progress");

  const result = await validateSessionForLogSet(
    fake,
    "se1",
    {
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
    }
  );

  check("result is ok", result.ok === true);
  check("lookupExistingSet was not called", fake.lookupExistingSetCalled === false);
}

console.log("\n2. ended session + identical existing set returns success");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionStatus("completed");
  fake.setExistingSet({
    reps: 10,
    weight_kg: 50,
    duration_seconds: null,
  });

  const result = await validateSessionForLogSet(
    fake,
    "se1",
    {
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
    }
  );

  check("result is ok", result.ok === true);
  check("lookupExistingSet was called", fake.lookupExistingSetCalled === true);
}

console.log("\n3. ended session + same set number but different reps is rejected");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionStatus("completed");
  fake.setExistingSet({
    reps: 10,
    weight_kg: 50,
    duration_seconds: null,
  });

  const result = await validateSessionForLogSet(
    fake,
    "se1",
    {
      setNumber: 1,
      reps: 12,
      weightKg: 50,
      durationSeconds: null,
    }
  );

  check("result is not ok", result.ok === false);
  if (!result.ok) {
    check("error code is SESSION_ENDED", result.code === "SESSION_ENDED");
    check("error message", result.error === "This session has ended.");
  }
}

console.log("\n4. ended session + same set number but different weight is rejected");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionStatus("completed");
  fake.setExistingSet({
    reps: 10,
    weight_kg: 50,
    duration_seconds: null,
  });

  const result = await validateSessionForLogSet(
    fake,
    "se1",
    {
      setNumber: 1,
      reps: 10,
      weightKg: 55,
      durationSeconds: null,
    }
  );

  check("result is not ok", result.ok === false);
  if (!result.ok) {
    check("error code is SESSION_ENDED", result.code === "SESSION_ENDED");
  }
}

console.log("\n5. ended session + same set number but different duration is rejected");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionStatus("completed");
  fake.setExistingSet({
    reps: null,
    weight_kg: null,
    duration_seconds: 30,
  });

  const result = await validateSessionForLogSet(
    fake,
    "se1",
    {
      setNumber: 1,
      reps: null,
      weightKg: null,
      durationSeconds: 45,
    }
  );

  check("result is not ok", result.ok === false);
  if (!result.ok) {
    check("error code is SESSION_ENDED", result.code === "SESSION_ENDED");
  }
}

console.log("\n6. ended session + no existing set is rejected");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionStatus("completed");
  fake.setExistingSet(null);

  const result = await validateSessionForLogSet(
    fake,
    "se1",
    {
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
    }
  );

  check("result is not ok", result.ok === false);
  if (!result.ok) {
    check("error code is SESSION_ENDED", result.code === "SESSION_ENDED");
  }
}

console.log("\n7. ended session + failed set lookup is rejected");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionStatus("completed");
  fake.setThrowLookupSet(true);

  const result = await validateSessionForLogSet(
    fake,
    "se1",
    {
      setNumber: 1,
      reps: 10,
      weightKg: 50,
      durationSeconds: null,
    }
  );

  check("result is not ok", result.ok === false);
  if (!result.ok) {
    check("error code is SESSION_ENDED", result.code === "SESSION_ENDED");
  }
}

console.log("\n8. ended session + identical set with null weight");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionStatus("completed");
  fake.setExistingSet({
    reps: 15,
    weight_kg: null,
    duration_seconds: null,
  });

  const result = await validateSessionForLogSet(
    fake,
    "se1",
    {
      setNumber: 1,
      reps: 15,
      weightKg: null,
      durationSeconds: null,
    }
  );

  check("result is ok", result.ok === true);
}

console.log("\n9. ended session + identical duration-based set");
{
  const fake = new FakeLogSetValidationDeps();
  fake.setSessionStatus("skipped");
  fake.setExistingSet({
    reps: null,
    weight_kg: null,
    duration_seconds: 60,
  });

  const result = await validateSessionForLogSet(
    fake,
    "se1",
    {
      setNumber: 1,
      reps: null,
      weightKg: null,
      durationSeconds: 60,
    }
  );

  check("result is ok", result.ok === true);
}

console.log("\n10. Real createClient: lookup filters on session_exercise_id, set_number, is_warmup_set");
{
  const recordedRequests: Array<{ url: string; method: string }> = [];
  const stubFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    recordedRequests.push({ url, method });

    if (url.includes("session_exercises") && method === "GET") {
      return new Response(
        JSON.stringify([{ sessions: { status: "completed" } }]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (url.includes("session_sets") && method === "GET") {
      const data: ExistingSetRow[] = [{ reps: 10, weight_kg: 50, duration_seconds: null }];
      return new Response(
        JSON.stringify(data),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
  };

  const client = createClient<Database>("http://fake.local", "anon", { global: { fetch: stubFetch } });
  const deps = buildLogSetValidationDeps(client);

  const result = await validateSessionForLogSet(deps, "se-123", {
    setNumber: 3,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  });

  check("result is ok (duplicate)", result.ok === true);

  const setLookupReq = recordedRequests.find((r) => r.url.includes("session_sets") && r.method === "GET");
  check("session_sets lookup was made", setLookupReq !== undefined);
  if (setLookupReq) {
    check("filters on session_exercise_id", setLookupReq.url.includes("session_exercise_id=eq.se-123"));
    check("filters on set_number", setLookupReq.url.includes("set_number=eq.3"));
    check("filters on is_warmup_set=false", setLookupReq.url.includes("is_warmup_set=eq.false"));
  }
}

console.log("\n11. Wrong set number does not count as duplicate");
{
  const receivedKeys: Array<{ sessionExerciseId: string; setNumber: number }> = [];

  const stubFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";

    if (url.includes("session_exercises") && method === "GET") {
      return new Response(
        JSON.stringify([{ sessions: { status: "completed" } }]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (url.includes("session_sets") && method === "GET") {
      const seIdMatch = url.match(/session_exercise_id=eq\.([^&]+)/);
      const setNumMatch = url.match(/set_number=eq\.(\d+)/);
      if (seIdMatch && setNumMatch) {
        receivedKeys.push({
          sessionExerciseId: seIdMatch[1],
          setNumber: parseInt(setNumMatch[1], 10),
        });
      }
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }

    return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
  };

  const client = createClient<Database>("http://fake.local", "anon", { global: { fetch: stubFetch } });
  const deps = buildLogSetValidationDeps(client);

  const result = await validateSessionForLogSet(deps, "se-123", {
    setNumber: 2,
    reps: 10,
    weightKg: 50,
    durationSeconds: null,
  });

  check("result is not ok (no existing set for set_number 2)", result.ok === false);
  if (!result.ok) {
    check("error code is SESSION_ENDED", result.code === "SESSION_ENDED");
  }
  check("lookup key was captured", receivedKeys.length > 0);
  if (receivedKeys.length > 0) {
    check("lookup received correct session_exercise_id", receivedKeys[0].sessionExerciseId === "se-123");
    check("lookup received correct set_number", receivedKeys[0].setNumber === 2);
  }
}

console.log("\n12. String weight converts to number (20 vs '20.0')");
{
  const stubFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";

    if (url.includes("session_exercises") && method === "GET") {
      return new Response(
        JSON.stringify([{ sessions: { status: "completed" } }]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (url.includes("session_sets") && method === "GET") {
      return new Response(
        JSON.stringify([{ reps: 10, weight_kg: "20.0", duration_seconds: null }]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
  };

  const client = createClient<Database>("http://fake.local", "anon", { global: { fetch: stubFetch } });
  const deps = buildLogSetValidationDeps(client);

  const result = await validateSessionForLogSet(deps, "se-123", {
    setNumber: 1,
    reps: 10,
    weightKg: 20,
    durationSeconds: null,
  });

  check("result is ok (20 matches 20.0)", result.ok === true);
}

console.log("\n13. null weight matches null");
{
  const stubFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";

    if (url.includes("session_exercises") && method === "GET") {
      return new Response(
        JSON.stringify([{ sessions: { status: "completed" } }]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (url.includes("session_sets") && method === "GET") {
      const data: ExistingSetRow[] = [{ reps: 15, weight_kg: null, duration_seconds: null }];
      return new Response(
        JSON.stringify(data),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
  };

  const client = createClient<Database>("http://fake.local", "anon", { global: { fetch: stubFetch } });
  const deps = buildLogSetValidationDeps(client);

  const result = await validateSessionForLogSet(deps, "se-123", {
    setNumber: 1,
    reps: 15,
    weightKg: null,
    durationSeconds: null,
  });

  check("result is ok (null matches null)", result.ok === true);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

})();

export {};
