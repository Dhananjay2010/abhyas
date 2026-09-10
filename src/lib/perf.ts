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
 */
import { cache } from "react";

export const PERF_ENABLED = process.env.PERF_DEBUG === "1";

type Call = { name: string; ms: number };

type Store = {
  route: string;
  calls: Call[];
  started: number;
  logScheduled: boolean;
};

/**
 * One store per request. React's `cache()` is scoped to a single server render
 * (and to a single Server Action invocation), which is exactly the lifetime we
 * want — no AsyncLocalStorage plumbing and nothing leaks between users.
 */
export const perfStore = cache(
  (): Store => ({ route: "", calls: [], started: performance.now(), logScheduled: false }),
);

/** Shorten a Supabase URL to something readable in a log line. */
function describe(url: string): string {
  try {
    const u = new URL(url);
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
 * Emit one line per request, after the response has been sent.
 *
 * `after()` keeps the logging off the critical path; if it is unavailable
 * (a context that forbids it) the summary is simply skipped rather than
 * breaking the page.
 */
function scheduleLog(store: Store) {
  if (store.logScheduled) return;
  store.logScheduled = true;

  const emit = () => {
    const total = performance.now() - store.started;
    const dbMs = store.calls.reduce((n, c) => n + c.ms, 0);
    const slowest = [...store.calls].sort((a, b) => b.ms - a.ms).slice(0, 3);
    console.log(
      `[perf] ${store.route || "?"} calls=${store.calls.length} ` +
        `supabase=${dbMs.toFixed(0)}ms wall=${total.toFixed(0)}ms ` +
        `slowest=${slowest.map((c) => `${c.name}:${c.ms.toFixed(0)}`).join(",")} ` +
        `seq=[${store.calls.map((c) => c.name).join(" ")}]`,
    );
  };

  import("next/server")
    .then(({ after }) => after(emit))
    .catch(() => emit());
}
