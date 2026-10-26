#!/usr/bin/env tsx
/**
 * Real render tests for History page empty states (Task G11).
 * 
 * Tests using the real HistoryClient component with jsdom/RTL.
 */

import { JSDOM } from "jsdom";
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", { url: "http://localhost/history", pretendToBeVisual: true });
const g = globalThis as Record<string, unknown>;
for (const k of ["window","document","HTMLElement","Node","navigator","MouseEvent","Event","getComputedStyle"]) {
  Object.defineProperty(g, k, { value: (dom.window as unknown as Record<string, unknown>)[k] ?? dom.window, writable: true, configurable: true });
}
g.IS_REACT_ACT_ENVIRONMENT = true; g.self = dom.window; (dom.window as unknown as Record<string, unknown>).requestIdleCallback ??= (cb: () => void) => setTimeout(cb, 0); g.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };

const pushes: string[] = [];
let currentSearch = new URLSearchParams();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module");
const orig = Module.prototype.require;
Module.prototype.require = function (id: string): unknown {
  if (id === "next/navigation") return {
    useRouter: () => ({ push: (u: string) => pushes.push(u), refresh() {}, replace() {}, prefetch() {}, back() {}, forward() {} }),
    useSearchParams: () => currentSearch, usePathname: () => "/history",
    redirect: (u: string) => { throw new Error("REDIRECT " + u); },
  };
  if (id === "./actions") return { closeOutSession: async () => ({}) };
  // eslint-disable-next-line prefer-rest-params
  return orig.apply(this, arguments);
};

let failures = 0;
function check(label: string, ok: boolean, detail = "") { if (!ok) failures++; console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`); }

(async () => {
  const React = await import("react");
  const { render, cleanup, fireEvent } = await import("@testing-library/react");
  const { HistoryClient } = await import("../src/app/history/history-client");
  const base = { page: 1, today: "2026-10-26", timezone: "UTC", units: { system: "metric" as const, display: "kg" as const }, hasErrors: false };

  console.log("\n1. True empty state (all counts 0)");
  {
    // @ts-expect-error - Units type simplified for testing
    const r = render(React.createElement(HistoryClient, { ...base, items: [], filter: "lifts", totalCount: 0, countsByFilter: { lifts: 0, yoga: 0, breathing: 0 } }));
    const html = r.container.innerHTML;
    check("true-empty copy rendered", html.includes("No completed sessions yet"));
    const a = r.container.querySelector('a[href="/today"]');
    check("CTA link to /today", !!a && /Start today/.test(a.textContent ?? ""), a?.outerHTML.slice(0, 80));
    check("no filtered-empty copy", !html.includes("No sessions match these filters"));
    check("no error copy", !html.includes("Couldn't load your sessions"));
    cleanup();
  }

  console.log("\n2. Filtered empty (Lifts tab with yoga=10)");
  {
    currentSearch = new URLSearchParams("filter=lifts&utm=x");
    pushes.length = 0;
    // @ts-expect-error - Units type simplified for testing
    const r = render(React.createElement(HistoryClient, { ...base, items: [], filter: "lifts", totalCount: 0, countsByFilter: { lifts: 0, yoga: 10, breathing: 0 } }));
    check("filtered copy rendered", r.container.innerHTML.includes("No sessions match these filters"));
    const btn = Array.from(r.container.querySelectorAll("button")).find(b => b.textContent === "Clear filters");
    check("Clear filters button exists", !!btn);
    if (btn) fireEvent.click(btn);
    check("pushes filter=yoga with utm kept", pushes[0] === "/history?filter=yoga&utm=x", `pushed=${pushes[0]}`);
    cleanup();
  }

  console.log("\n3. Error state (hasErrors with zero counts)");
  {
    // @ts-expect-error - Units type simplified for testing
    const r = render(React.createElement(HistoryClient, { ...base, items: [], filter: "lifts", totalCount: 0, countsByFilter: { lifts: 0, yoga: 0, breathing: 0 }, hasErrors: true }));
    const html = r.container.innerHTML;
    check("error copy rendered", html.includes("Couldn't load your sessions"));
    check("no CTA", !html.includes('href="/today"'));
    check("banner shown", html.includes("Couldn't load some stats"));
    cleanup();
  }

  console.log("\n4. Populated state");
  {
    const items = [{
      id: "s1", localDate: "2026-10-26", status: "completed" as const, actualType: "weights" as const, 
      durationSeconds: 3600, startedAt: "2026-10-26T10:00:00Z", completedAt: "2026-10-26T11:00:00Z",
      isDeload: false, endedEarly: false, plannedSets: 12, programDayLabel: "Upper A", setCount: 12,
      volumeKg: 5000, topSetWeight: 100, hasPR: false, breathing: null,
    }];
    // @ts-expect-error - Units type simplified for testing
    const r = render(React.createElement(HistoryClient, { ...base, items, filter: "lifts", totalCount: 1, countsByFilter: { lifts: 1, yoga: 0, breathing: 0 } }));
    const html = r.container.innerHTML;
    check("session rendered", html.includes("Upper A"));
    check("no empty copy", !html.includes("No completed sessions yet") && !html.includes("No sessions match"));
    cleanup();
  }

  console.log(failures ? `\n${failures} FAIL` : "\nAll history tests passed");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.log("Test error:", e?.stack ?? e); process.exit(2); });
