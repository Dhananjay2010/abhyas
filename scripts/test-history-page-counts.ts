import { JSDOM } from "jsdom";
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { url: "http://localhost/history", pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
for (const k of ["window","document","HTMLElement","Node","navigator","MouseEvent","Event","getComputedStyle"]) Object.defineProperty(g, k, { value: (dom.window as unknown as Record<string, unknown>)[k] ?? dom.window, writable: true, configurable: true });
g.self = dom.window; g.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
let counts: Record<string, number> = {}; let rpcError: Record<string, unknown> = {};
function chain(table: string) {
  const result = table === "profiles" ? { data: { timezone: "UTC", onboarding_completed_at: "2026-01-01", units: "kg", primary_track: "weights" }, error: null } : { data: [], error: null };
  const c: Record<string, unknown> = {};
  for (const m of ["select","eq","neq","order","limit","in","gte","lte","lt","not","is","range"]) c[m] = () => c;
  c.single = () => Promise.resolve(result); c.maybeSingle = () => Promise.resolve(result);
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
  return c;
}
const fakeClient = { from: (t: string) => chain(t), rpc: (n: string, a: Record<string, unknown>) => {
  if (n !== "get_history_page") return Promise.resolve({ data: [], error: null });
  const f = String(a.p_filter); 
  if (rpcError[f] && a.p_limit === 1) return Promise.resolve({ data: null, error: rpcError[f] });
  const total = counts[f] ?? 0; const off = Number(a.p_offset ?? 0); const lim = Number(a.p_limit);
  const rows = Array.from({ length: Math.max(0, Math.min(lim, total - off)) }, (_, i) => ({ session_id: `${f}-${off + i}`, total_count: total }));
  return Promise.resolve({ data: rows, error: null });
} };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module"); const orig = Module.prototype.require;
Module.prototype.require = function (id: string): unknown {
  if (id === "next/navigation") return { useRouter: () => ({ push() {}, refresh() {}, replace() {}, prefetch() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/history", redirect: (u: string) => { throw new Error("REDIRECT " + u); } };
  if (id === "next/cache") return { revalidatePath() {} };
  if (id === "./actions") return { closeOutSession: async () => ({}) };
  if (id === "@/lib/supabase/auth") return { getAuthedClient: async () => ({ supabase: fakeClient, user: { id: "u1" } }) };
  // eslint-disable-next-line prefer-rest-params
  return orig.apply(this, arguments);
};
let failures = 0;
function check(l: string, ok: boolean) { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${l}`); }
(async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: HistoryPage } = await import("../src/app/history/page");
  const r = async (filter?: string) => renderToStaticMarkup(await HistoryPage({ searchParams: Promise.resolve(filter ? { filter } : {}) }) as import("react").ReactElement);
  counts = { lifts: 0, yoga: 10, breathing: 0 };
  let h = await r("lifts");
  check("H1 lifts=0, yoga=10 -> filtered-empty reached at page level", h.includes("No Lifts sessions yet"));
  check("H1 switch button uses the per-tab count", h.includes("Switch to Yoga (10)"));
  check("H1 no 'Nothing here yet.' above the card", !h.includes("Nothing here yet"));
  check("H1 not true-empty", !h.includes("No completed sessions yet"));
  counts = {}; h = await r();
  check("H2 all zero -> true-empty with /today CTA", h.includes("No completed sessions yet") && h.includes('href="/today"'));
  counts = { lifts: 0, yoga: 10, breathing: 0 }; rpcError = { yoga: { message: "boom" } }; h = await r("lifts");
  check("H3 count RPC error -> error state, not true-empty", h.includes("Couldn") && !h.includes("No completed sessions yet"));
  console.log(failures ? `\n${failures} FAIL` : "\nAll history page tests passed"); process.exit(failures ? 1 : 0);
})().catch(e => { console.log("Test error:", e?.stack ?? e); process.exit(2); });
