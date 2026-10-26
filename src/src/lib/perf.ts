/**
 * Request-scoped timing for the server.
 *
 * Turned on by setting `PERF_DEBUG=1`. When it is off, every function here is
 * a no-op beyond a cheap boolean check, so it is safe to leave the calls in
 * place permanently — which is the point: the numbers stay reproducible on the
 * next person to look at a slow page.
 *
 * The instrumentation deliberately sits on the Supabase client's `fetch`
 * rather than in the pages. Every page is a chain of Supabase round trips, so
 * counting and timing those round trips describes the page's cost without a
 * single timing call inside the page itself.
 *
 * It also records event-loop lag, which is what separates the two very
 * different explanations for a slow `fetch`. A fetch that takes a second
 * because the network took a second, and a fetch that takes a second because
 * this process was too busy to run the callback that resolves it, look
 * identical from the outside and want opposite fixes.
 */
import { cache } from "react";
import { after } from "next/server";

export const PERF_ENABLED = process.env.PERF_DEBUG === "1";

/** Module scope survives between invocations on a warm instance. */
let invocationsOnThisInstance = 0;
const instanceBootedAt = Date.now();

type Call = { name: string; ms: number };

type Store = {
  route: string;
  calls: Call[];
  started: number;
  emitted: boolean;
  timer?: ReturnType<typeof setTimeout>;
  cold: boolean;
  maxLagMs: number;
  stopSampling?: () => void;
};

/**
 * One store per request. React's `cache()` is scoped to a single server render,
 * so no plumbing is needed and nothing leaks between users.
 *
 * Server Actions do not share a render scope the way a page render does, so
 * each call there logs its own line. That is a quirk of the harness, not of the
 * app: the per-call durations are still exact.
 */
export const perfStore = cache((): Store => {
  invocationsOnThisInstance += 1;
  const store: Store = {
    route: "",
    calls: [],
    started: performance.now(),
    emitted: false,
    cold: invocationsOnThisInstance === 1,
    maxLagMs: 0,
  };
  if (PERF_ENABLED) startSamplingLag(store);
  return store;
});

/**
 * Sample how late a zero-delay timer actually fires.
 *
 * A healthy process answers in under a millisecond or two. If this climbs into
 * the hundreds while fetches are "slow", the fetches are not slow — the
 * process is starved, and no amount of query tuning will help.
 */
function startSamplingLag(store: Store) {
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const t = performance.now();
    setTimeout(() => {
      if (stopped) return;
      store.maxLagMs = Math.max(store.maxLagMs, performance.now() - t);
      tick();
    }, 20);
  };
  tick();
  store.stopSampling = () => {
    stopped = true;
  };
}

/** Shorten a Supabase URL to something readable in a log line. */
function describe(url: string): string {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith("/rest/v1/rpc/")) {
      return `rpc:${u.pathname.slice("/rest/v1/rpc/".length)}`;
    }
    if (u.pathname.startsWith("/rest/v1/")) {
      const table = u.pathname.slice("/rest/v1/".length) || "rest";
      return u.searchParams.has("select") ? table : `${table}:write`;
    }
    if (u.pathname.startsWith("/auth/v1/")) {
      return `auth:${u.pathname.slice("/auth/v1/".length)}`;
    }
    return u.pathname;
  } catch {
    return "unknown";
  }
}

/**
 * Wrap `fetch` so each Supabase call is timed and recorded.
 *
 * Returns the global fetch untouched when profiling is off, so the hot path
 * carries no wrapper at all in normal operation.
 */
export function timedFetch(): typeof fetch | undefined {
  if (!PERF_ENABLED) return undefined;

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const started = performance.now();
    try {
      return await fetch(input, init);
    } finally {
      const store = perfStore();
      store.calls.push({ name: describe(url), ms: performance.now() - started });
      scheduleLog(store);
    }
  };
}

/** Record the route being rendered, so the log line says which page was slow. */
export function setPerfRoute(route: string) {
  if (!PERF_ENABLED) return;
  const store = perfStore();
  if (!store.route) store.route = route;
}

/**
 * Emit one line per request, once all its Supabase calls have settled.
 *
 * This was originally scheduled with `after()`, which is the right primitive
 * on paper — it runs the callback once the response is sent, keeping logging
 * off the critical path. In practice those lines never appeared in production
 * logs, only in preview: the instance is frozen the moment it responds and the
 * output goes nowhere. A profiler that silently logs nothing is worse than no
 * profiler, because it is trusted.
 *
 * So the summary is emitted from a short timer that is re-armed by every
 * recorded call and fires once they stop, while the request is still alive.
 * `after()` stays as a backstop for whichever fires first; `emitted` makes sure
 * only one of them speaks.
 */
function scheduleLog(store: Store) {
  const emit = () => {
    if (store.emitted) return;
    store.emitted = true;
    store.stopSampling?.();
    if (store.timer) clearTimeout(store.timer);
    const total = performance.now() - store.started;
    const dbMs = store.calls.reduce((n, c) => n + c.ms, 0);
    const slowest = [...store.calls].sort((a, b) => b.ms - a.ms).slice(0, 3);
    console.log(
      `[perf] ${store.route || "?"} calls=${store.calls.length} ` +
        `supabase=${dbMs.toFixed(0)}ms wall=${total.toFixed(0)}ms ` +
        `lag=${store.maxLagMs.toFixed(0)}ms ` +
        `${store.cold ? "COLD" : "warm"} ` +
        `region=${process.env.VERCEL_REGION ?? "?"} ` +
        `age=${((Date.now() - instanceBootedAt) / 1000).toFixed(0)}s ` +
        `slowest=${slowest.map((c) => `${c.name}:${c.ms.toFixed(0)}`).join(",")} ` +
        `seq=[${store.calls.map((c) => c.name).join(" ")}]`,
    );
  };

  // Re-armed by each call, so the line is written once the page has stopped
  // querying rather than after the first query returns.
  if (store.timer) clearTimeout(store.timer);
  store.timer = setTimeout(emit, 120);

  try {
    after(emit);
  } catch {
    // `after()` is unavailable here; the timer above still covers it.
  }
}
