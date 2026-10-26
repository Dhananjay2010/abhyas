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
    check("no filtered-empty copy", !html.includes("No Lifts sessions yet") && !html.includes("Switch to"));
    check("no error copy", !html.includes("Couldn't load your sessions"));
    check("P1 old 'Nothing here yet.' line gone on true-empty", !html.includes("Nothing here yet"));
    check("P1 no session-count line on true-empty", !/\d+ sessions?\./.test(html));
    cleanup();
  }

  console.log("\n2. Filtered empty (Lifts tab with yoga=10)");
  {
    currentSearch = new URLSearchParams("filter=lifts&utm=x");
    pushes.length = 0;
    // @ts-expect-error - Units type simplified for testing
    const r = render(React.createElement(HistoryClient, { ...base, items: [], filter: "lifts", totalCount: 0, countsByFilter: { lifts: 0, yoga: 10, breathing: 0 } }));
    const html2 = r.container.innerHTML;
    check("filtered copy names the current tab", html2.includes("No Lifts sessions yet"));
    check("P1 old 'Nothing here yet.' line gone on filtered-empty", !html2.includes("Nothing here yet"));
    check("P2 no 'Clear filters' / 'Showing' copy", !html2.includes("Clear filters") && !html2.includes("Showing "));
    const btn = Array.from(r.container.querySelectorAll("button")).find(b => b.textContent === "Switch to Yoga (10)");
    check("P2 button labelled 'Switch to Yoga (10)'", !!btn, Array.from(r.container.querySelectorAll("button")).map(b => b.textContent).join(" | "));
    if (btn) fireEvent.click(btn);
    check("pushes filter=yoga with utm kept", pushes[0] === "/history?filter=yoga&utm=x", `pushed=${pushes[0]}`);
    cleanup();
  }

  console.log("\n2b. Filtered empty (Breathing tab, lifts=3, yoga=10): label and action agree");
  {
    currentSearch = new URLSearchParams("filter=breathing&page=2");
    pushes.length = 0;
    // @ts-expect-error - Units type simplified for testing
    const r = render(React.createElement(HistoryClient, { ...base, items: [], filter: "breathing", totalCount: 0, countsByFilter: { lifts: 3, yoga: 10, breathing: 0 } }));
    check("filtered copy names Breathing", r.container.innerHTML.includes("No Breathing sessions yet"));
    const btn = Array.from(r.container.querySelectorAll("button")).find(b => (b.textContent ?? "").startsWith("Switch to"));
    check("P2 label is 'Switch to Lifts (3)'", btn?.textContent === "Switch to Lifts (3)", btn?.textContent ?? "none");
    if (btn) fireEvent.click(btn);
    check("P2 click goes to the tab the label names (lifts), page dropped", pushes[0] === "/history?filter=lifts", `pushed=${pushes[0]}`);
    cleanup();
  }

  console.log("\n2c. Filtered empty, breathing is the only tab with sessions (QA3 Q2)");
  {
    currentSearch = new URLSearchParams("filter=lifts");
    pushes.length = 0;
    // @ts-expect-error - Units type simplified for testing
    const r = render(React.createElement(HistoryClient, { ...base, items: [], filter: "lifts", totalCount: 0, countsByFilter: { lifts: 0, yoga: 0, breathing: 5 } }));
    const btn = Array.from(r.container.querySelectorAll("button")).find(b => (b.textContent ?? "").startsWith("Switch to"));
    check("Q2 label is 'Switch to Breathing (5)' (skips empty Yoga)", btn?.textContent === "Switch to Breathing (5)", btn?.textContent ?? "none");
    if (btn) fireEvent.click(btn);
    check("Q2 click goes to filter=breathing", pushes[0] === "/history?filter=breathing", `pushed=${pushes[0]}`);
    cleanup();
  }

  console.log("\n2d. Page past the end on a non-empty tab (QA3 LOW-4)");
  {
    currentSearch = new URLSearchParams("filter=lifts&page=3&utm=x");
    pushes.length = 0;
    // @ts-expect-error - Units type simplified for testing
    const r = render(React.createElement(HistoryClient, { ...base, page: 3, items: [], filter: "lifts", totalCount: 25, countsByFilter: { lifts: 25, yoga: 4, breathing: 0 } }));
    const html = r.container.innerHTML;
    check("LOW-4 says no sessions on this page", html.includes("No sessions on this page"));
    check("LOW-4 no tab switch offered", !html.includes("Switch to") && !html.includes("No Lifts sessions yet"));
    const btn = Array.from(r.container.querySelectorAll("button")).find(b => b.textContent === "Go to page 1");
    check("LOW-4 'Go to page 1' button", !!btn);
    if (btn) fireEvent.click(btn);
    check("LOW-4 click keeps the tab, drops page", pushes[0] === "/history?filter=lifts&utm=x", `pushed=${pushes[0]}`);
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
    check("P1 old 'Nothing here yet.' line gone on error", !html.includes("Nothing here yet"));
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
    check("no empty copy", !html.includes("No completed sessions yet") && !html.includes("sessions yet</p>"));
    check("count line kept above a list ('1 session.')", html.includes("1 session."));
    cleanup();
  }

  console.log("\n5. Error with loaded items (QA3 LOW-5 / Q18)");
  {
    const items = [{
      id: "s1", localDate: "2026-10-26", status: "completed" as const, actualType: "weights" as const,
      durationSeconds: 3600, startedAt: "2026-10-26T10:00:00Z", completedAt: "2026-10-26T11:00:00Z",
      isDeload: false, endedEarly: false, plannedSets: 12, programDayLabel: "Upper A", setCount: 12,
      volumeKg: 5000, topSetWeight: 100, hasPR: false, breathing: null,
    }];
    // @ts-expect-error - Units type simplified for testing
    const r = render(React.createElement(HistoryClient, { ...base, items, filter: "lifts", totalCount: 1, countsByFilter: { lifts: 1, yoga: 0, breathing: 0 }, hasErrors: true }));
    const html = r.container.innerHTML;
    check("Q18 loaded session still listed when a side query failed", html.includes("Upper A"));
    check("Q18 banner shown alongside the list", html.includes("Couldn't load some stats"));
    check("Q18 no full error card", !html.includes("Couldn't load your sessions"));
    cleanup();
  }

  console.log(failures ? `\n${failures} FAIL` : "\nAll history tests passed");
  process.exit(failures ? 1 : 0);
})().catch(e => { console.log("Test error:", e?.stack ?? e); process.exit(2); });
