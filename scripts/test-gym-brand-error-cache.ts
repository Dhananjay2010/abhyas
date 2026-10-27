/**
 * Real cache harness for getGymBrand: tests that RPC errors are not cached.
 * Adapted from QA's cache-harness.ts.
 * 
 * Uses the REAL getGymBrand function with fake Next incrementalCache via 
 * globalThis.__incrementalCache + fetch interception (no network, no server).
 * 
 * Kills QA's cache mutants C1-C5:
 * - C1: revalidate: false
 * - C2: error cached (return {} instead of throw)
 * - C3: gym id dropped from cache key
 * - C4: gym id dropped from tag
 * - C5: outer catch rethrows
 */

import { AsyncLocalStorage } from "node:async_hooks";
(globalThis as any).AsyncLocalStorage = AsyncLocalStorage;

// Setup fake environment
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://fake.supabase.local";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";

// In-memory cache store
type Entry = { body: string; revalidate: number; tags: string[] };
const store = new Map<string, Entry>();
const sets: { key: string; body: string; revalidate: number; tags: string[] }[] = [];

// Mock Next.js incrementalCache
(globalThis as any).__incrementalCache = {
  isOnDemandRevalidate: false,
  generateSimpleCacheKey: async (k: string) => k,
  get: async (key: string) => {
    const e = store.get(key);
    return e ? { isStale: false, value: { kind: "FETCH", data: { body: e.body } } } : null;
  },
  set: async (key: string, v: any, ctx: any) => {
    const e = { body: v.data.body, revalidate: v.revalidate, tags: ctx.tags };
    store.set(key, e);
    sets.push({ key, ...e });
  },
};

// RPC mode control
let mode: Record<string, "ok" | "err" | "empty"> = {};
let rpcCalls = 0;

// Mock fetch to intercept RPC calls
const realFetch = globalThis.fetch;
(globalThis as any).fetch = async (url: any, init: any) => {
  const u = String(url);
  if (!u.includes("/rest/v1/rpc/get_gym_brand")) return realFetch(url, init);
  
  rpcCalls++;
  const id = JSON.parse(init.body).p_gym_id;
  const m = mode[id] ?? "ok";
  
  if (m === "err") {
    return new Response(
      JSON.stringify({ code: "PGRST000", message: "boom" }),
      { status: 503, headers: { "content-type": "application/json" } }
    );
  }
  
  if (m === "empty") {
    return new Response(
      "[]",
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }
  
  return new Response(
    JSON.stringify([{ name: `Gym ${id}`, slug: id, timezone: null }]),
    { status: 200, headers: { "content-type": "application/json" } }
  );
};

// Test harness
let fails = 0;
const check = (l: string, ok: boolean, d = "") => {
  if (!ok) fails++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${l}${d ? " -- " + d : ""}`);
};

(async () => {
  const { getGymBrand } = await import("../src/lib/gym-brand");
  const { neutralBrand } = await import("../src/lib/gym-brand");
  
  // Suppress console.error from getGymBrand
  const origErr = console.error;
  console.error = () => {};
  
  console.log("TEST: H1-H3 - RPC error not cached, fallback to neutral brand");
  {
    mode = { A: "err" };
    const r1 = await getGymBrand("A");
    check(
      "H1 RPC error -> neutral brand returned (no throw)",
      r1.id === "neutral" && r1.name === neutralBrand.name,
      JSON.stringify(r1).slice(0, 60)
    );
    check(
      "H2 RPC error -> nothing written to cache",
      sets.filter(s => s.key.includes('"A"') || s.key.includes("gym-brand-A")).length === 0,
      JSON.stringify(sets.map(s => s.body))
    );
    
    mode = { A: "ok" };
    const r2 = await getGymBrand("A");
    check(
      "H3 after error, next call reaches RPC and returns real brand",
      r2.name === "Gym A",
      JSON.stringify(r2)
    );
  }
  console.log();
  
  console.log("TEST: H4-H5 - Success cached with finite revalidate and tag");
  {
    const sA = sets.find(s => s.body.includes("Gym A"));
    check(
      "H4 success cached with finite revalidate (<= 1 day)",
      !!sA && sA.revalidate > 0 && sA.revalidate <= 86400,
      String(sA?.revalidate)
    );
    check(
      "H5 success tagged gym-brand:A",
      !!sA && sA.tags.includes("gym-brand:A"),
      JSON.stringify(sA?.tags)
    );
  }
  console.log();
  
  console.log("TEST: H6-H7 - Cache key includes gym ID");
  {
    mode = { B: "ok" };
    const callsBefore = rpcCalls;
    const r3 = await getGymBrand("B");
    check(
      "H6 gym B gets its own brand (key includes gym id)",
      r3.name === "Gym B",
      JSON.stringify(r3)
    );
    check("H7 gym B triggered its own RPC", rpcCalls === callsBefore + 1);
  }
  console.log();
  
  console.log("TEST: H8-H9 - Not-found cached with finite revalidate");
  {
    mode = { C: "empty" };
    const r4 = await getGymBrand("C");
    check("H8 not-found -> {}", JSON.stringify(r4) === "{}");
    
    const sC = sets.find(s => s.body === "{}");
    check(
      "H9 not-found not cached forever (finite revalidate)",
      !sC || (sC.revalidate > 0 && sC.revalidate <= 86400),
      String(sC?.revalidate)
    );
  }
  console.log();
  
  console.log("TEST: H10 - Cached success served without RPC");
  {
    const c2 = rpcCalls;
    await getGymBrand("A");
    check("H10 cached success served without RPC", rpcCalls === c2);
  }
  console.log();
  
  console.error = origErr;
  
  if (fails > 0) {
    console.error(`\n❌ ${fails} test(s) failed\n`);
    process.exit(1);
  }
  
  console.log("\n✅ All tests passed\n");
  process.exit(0);
})().catch(e => {
  console.log("HARNESS CRASH", e?.message);
  console.error(e);
  process.exit(2);
});
