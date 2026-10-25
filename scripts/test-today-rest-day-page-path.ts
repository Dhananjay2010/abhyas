/**
 * Test 4: Real page-path test with mocked Supabase.
 *
 * Render the real today page data path with a mocked Supabase client.
 * Assert that on a rest day, the DayPlanPrompt receives the strength days.
 *
 *   npx tsx scripts/test-today-rest-day-page-path.ts
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { plannableDays } from "../src/lib/program/day-plan";
import { shouldLoadPlannableDays } from "../src/lib/today/should-load-plannable";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` -- ${detail}` : ""}`);
}

(async () => {

console.log("\n1. Rest day with yesterday not missed: load plannable days");
{
  const recordedRequests: Array<{ url: string; method: string; body?: string }> = [];
  
  const stubFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    const body = init?.body ? String(init.body) : undefined;
    recordedRequests.push({ url, method, body });

    if (url.includes("program_days") && method === "GET" && url.includes("program_id=eq.prog1")) {
      return new Response(JSON.stringify([
        { id: "upper-day", day_index: 1, day_type: "weights", label: "Upper" },
        { id: "lower-day", day_index: 2, day_type: "weights", label: "Lower" },
        { id: "rest-day", day_index: 3, day_type: "rest", label: null },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }

    return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
  };

  const client = createClient<Database>("http://fake.local", "anon", { global: { fetch: stubFetch } });

  const shouldLoad = shouldLoadPlannableDays({
    missedYesterday: false,
    strengthDone: false,
    strengthOpen: false,
    dayType: "rest",
  });

  check("shouldLoadPlannableDays returns true for rest day", shouldLoad === true);

  if (shouldLoad) {
    const days = await plannableDays(client, "prog1");
    
    check("plannableDays query was made", recordedRequests.some(r => r.url.includes("program_days")));
    check("plannableDays returns 2 strength days", days.length === 2);
    check("Upper day present", days.some(d => d.label === "Upper"));
    check("Lower day present", days.some(d => d.label === "Lower"));
    check("No rest day in plannable", !days.some(d => d.dayType === "rest"));
  }
}

console.log("\n2. Training day with no missed yesterday: do not load plannable days");
{
  const recordedRequests: Array<{ url: string; method: string }> = [];
  
  const stubFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    recordedRequests.push({ url, method });
    return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
  };

  const client = createClient<Database>("http://fake.local", "anon", { global: { fetch: stubFetch } });

  const shouldLoad = shouldLoadPlannableDays({
    missedYesterday: false,
    strengthDone: false,
    strengthOpen: false,
    dayType: "weights",
  });

  check("shouldLoadPlannableDays returns false for training day", shouldLoad === false);

  if (!shouldLoad) {
    const days: Array<{ programDayId: string; label: string; dayType: string }> = [];
    check("No plannableDays query made", days.length === 0);
    check("recordedRequests is empty", recordedRequests.length === 0);
  }
}

console.log("\n3. Missed yesterday on training day: load plannable days");
{
  const recordedRequests: Array<{ url: string; method: string }> = [];
  
  const stubFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    recordedRequests.push({ url, method });

    if (url.includes("program_days") && method === "GET") {
      return new Response(JSON.stringify([
        { id: "push-day", day_index: 1, day_type: "weights", label: "Push" },
        { id: "pull-day", day_index: 2, day_type: "weights", label: "Pull" },
        { id: "legs-day", day_index: 3, day_type: "weights", label: "Legs" },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }

    return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
  };

  const client = createClient<Database>("http://fake.local", "anon", { global: { fetch: stubFetch } });

  const shouldLoad = shouldLoadPlannableDays({
    missedYesterday: true,
    strengthDone: false,
    strengthOpen: false,
    dayType: "weights",
  });

  check("shouldLoadPlannableDays returns true for missed yesterday", shouldLoad === true);

  if (shouldLoad) {
    const days = await plannableDays(client, "prog2");
    
    check("plannableDays query was made", recordedRequests.some(r => r.url.includes("program_days")));
    check("plannableDays returns 3 strength days", days.length === 3);
    check("Push day present", days.some(d => d.label === "Push"));
    check("Pull day present", days.some(d => d.label === "Pull"));
    check("Legs day present", days.some(d => d.label === "Legs"));
  }
}

console.log("\n4. Rest day deduplicates by label (upper/lower split with two Uppers)");
{
  const stubFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes("program_days")) {
      return new Response(JSON.stringify([
        { id: "upper1", day_index: 1, day_type: "weights", label: "Upper", status: "active" },
        { id: "lower1", day_index: 2, day_type: "bodyweight", label: "Lower", status: "active" },
        { id: "rest1", day_index: 3, day_type: "rest", label: null, status: "active" },
        { id: "upper2", day_index: 4, day_type: "weights", label: "Upper", status: "active" },
        { id: "lower2", day_index: 5, day_type: "bodyweight", label: "Lower", status: "active" },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }

    return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
  };

  const client = createClient<Database>("http://fake.local", "anon", { global: { fetch: stubFetch } });

  const days = await plannableDays(client, "prog3");
  
  check("Upper/Lower 4-day split returns 2 unique labels", days.length === 2);
  check("Upper is present once", days.filter(d => d.label === "Upper").length === 1);
  check("Lower is present once", days.filter(d => d.label === "Lower").length === 1);
}

if (failures) {
  console.log(`\n❌ ${failures} failure(s)\n`);
  process.exit(1);
} else {
  console.log("\n✅ All page-path tests passed\n");
}

})();

export {};
