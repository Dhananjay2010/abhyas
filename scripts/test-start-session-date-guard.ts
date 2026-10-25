/**
 * Test startSessionCore guards against returning wrong-date sessions after 23505.
 * 
 * Scenario: After midnight, yesterday's in_progress session causes a 23505 on
 * insert. startSessionCore must verify the re-read session's local_date matches
 * the payload's local_date before returning it. If not, return an error to
 * prevent inserting today's exercises into yesterday's session.
 * 
 *   npx tsx scripts/test-start-session-date-guard.ts
 */

import { startSessionCore } from "../src/lib/session/start-session-core";
import type { Database } from "../src/lib/database.types";
import { createClient } from "@supabase/supabase-js";

type SessionsInsert = Database["public"]["Tables"]["sessions"]["Insert"];
type SessionRow = { id: string; created_at: string; local_date: string };

function createStubFetch(config: {
  shouldReturn23505: boolean;
  existingSession: SessionRow | null;
}) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    
    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((value, key) => {
          headers[key.toLowerCase()] = value;
        });
      } else if (Array.isArray(init.headers)) {
        for (const [key, value] of init.headers) {
          headers[key.toLowerCase()] = value;
        }
      } else {
        for (const [key, value] of Object.entries(init.headers)) {
          headers[key.toLowerCase()] = value as string;
        }
      }
    }

    if (url.includes("sessions") && method === "POST") {
      if (config.shouldReturn23505) {
        return new Response(
          JSON.stringify({ message: "duplicate key value violates unique constraint", code: "23505" }),
          { status: 409, headers: { "content-type": "application/json" } }
        );
      }
      const wantsSingle = headers.accept && headers.accept.includes("vnd.pgrst.object");
      if (wantsSingle) {
        return new Response(
          JSON.stringify({ id: "new-session-id" }),
          { status: 201, headers: { "content-type": "application/vnd.pgrst.object+json" } }
        );
      }
      return new Response(
        JSON.stringify([{ id: "new-session-id" }]),
        { status: 201, headers: { "content-type": "application/json", "content-range": "0-0/1" } }
      );
    }

    if (url.includes("sessions") && method === "GET" && url.includes("status=eq.in_progress")) {
      if (config.existingSession) {
        const wantsSingle = headers.accept && headers.accept.includes("vnd.pgrst.object");
        if (wantsSingle) {
          return new Response(
            JSON.stringify(config.existingSession),
            { status: 200, headers: { "content-type": "application/vnd.pgrst.object+json" } }
          );
        }
        return new Response(
          JSON.stringify([config.existingSession]),
          { status: 200, headers: { "content-type": "application/json", "content-range": "0-0/1" } }
        );
      }
      return new Response(
        JSON.stringify([]),
        { status: 200, headers: { "content-type": "application/json", "content-range": "*/0" } }
      );
    }

    return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
  };
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

(async () => {

console.log("\n1. Normal insert succeeds (no 23505)");
{
  const stubFetch = createStubFetch({
    shouldReturn23505: false,
    existingSession: null,
  });
  const client = createClient<Database>("http://fake.local", "anon", { global: { fetch: stubFetch } });

  const result = await startSessionCore(client, "user1", {
    user_id: "user1",
    program_id: "prog1",
    program_day_id: "day1",
    local_date: "2026-10-25",
    week_in_block: 1,
    is_deload: false,
    planned_type: "weights",
    actual_type: "weights",
    status: "in_progress",
    started_at: "2026-10-25T10:00:00Z",
  });

  check("result is ok", result.ok === true);
  if (result.ok) {
    check("sessionId is returned", result.sessionId !== undefined && result.sessionId.length > 0);
  }
}

console.log("\n2. 23505 + re-read with SAME local_date returns session id");
{
  const stubFetch = createStubFetch({
    shouldReturn23505: true,
    existingSession: {
      id: "same-day-session",
      created_at: "2026-10-25T09:00:00Z",
      local_date: "2026-10-25",
    },
  });
  const client = createClient<Database>("http://fake.local", "anon", { global: { fetch: stubFetch } });

  const result = await startSessionCore(client, "user1", {
    user_id: "user1",
    program_id: "prog1",
    program_day_id: "day1",
    local_date: "2026-10-25",
    week_in_block: 1,
    is_deload: false,
    planned_type: "weights",
    actual_type: "weights",
    status: "in_progress",
    started_at: "2026-10-25T10:00:00Z",
  });

  check("result is ok", result.ok === true);
  if (result.ok) {
    check("sessionId is same-day-session", result.sessionId === "same-day-session");
  }
}

console.log("\n3. 23505 + re-read with DIFFERENT local_date returns error");
{
  const stubFetch = createStubFetch({
    shouldReturn23505: true,
    existingSession: {
      id: "yesterday-session",
      created_at: "2026-10-24T23:30:00Z",
      local_date: "2026-10-24",
    },
  });
  const client = createClient<Database>("http://fake.local", "anon", { global: { fetch: stubFetch } });

  const result = await startSessionCore(client, "user1", {
    user_id: "user1",
    program_id: "prog1",
    program_day_id: "day1",
    local_date: "2026-10-25",
    week_in_block: 1,
    is_deload: false,
    planned_type: "weights",
    actual_type: "weights",
    status: "in_progress",
    started_at: "2026-10-25T10:00:00Z",
  });

  check("result is not ok", result.ok === false);
  if (!result.ok) {
    check("error mentions different day", result.error.includes("different day"));
  }
}

console.log("\n4. 23505 + no re-read result returns generic error");
{
  const stubFetch = createStubFetch({
    shouldReturn23505: true,
    existingSession: null,
  });
  const client = createClient<Database>("http://fake.local", "anon", { global: { fetch: stubFetch } });

  const result = await startSessionCore(client, "user1", {
    user_id: "user1",
    program_id: "prog1",
    program_day_id: "day1",
    local_date: "2026-10-25",
    week_in_block: 1,
    is_deload: false,
    planned_type: "weights",
    actual_type: "weights",
    status: "in_progress",
    started_at: "2026-10-25T10:00:00Z",
  });

  check("result is not ok", result.ok === false);
  if (!result.ok) {
    check("error is present", result.error.length > 0);
  }
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

})();

export {};
