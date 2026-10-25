import { NextResponse } from "next/server";

/**
 * Latency probe for the path between this function and Supabase.
 *
 * The per-request logs said something that the page code cannot explain: single
 * primary-key selects taking seconds, from a function in `bom1` to a database
 * in Mumbai. That is either the network, the database, or this process being
 * too starved to notice a response had arrived — and those three call for
 * completely different fixes, so they have to be told apart rather than
 * guessed between.
 *
 * Reachable only when PERF_TOKEN is configured and the caller presents it.
 * Without both it does not exist.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Survives between invocations on a warm instance; distinguishes cold from warm. */
let invocations = 0;
const bootedAt = Date.now();

async function time<T>(fn: () => Promise<T>): Promise<{ ms: number; note: string }> {
  const t = performance.now();
  let note = "ok";
  try {
    const r = (await fn()) as unknown as Response;
    note = r && typeof r === "object" && "status" in r ? String(r.status) : "ok";
  } catch (e) {
    note = `error: ${e instanceof Error ? e.message : String(e)}`;
  }
  return { ms: Math.round((performance.now() - t) * 10) / 10, note };
}

const hit = (path: string) =>
  fetch(`${SB}${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    cache: "no-store",
  }).then(async (r) => {
    await r.arrayBuffer(); // drain, so the timing covers the whole response
    return r;
  });

/**
 * How long a promise that does no I/O takes to resolve.
 *
 * If this is not ~0, the event loop is starved and every "slow fetch" number in
 * the logs is partly this process failing to run its own callbacks — which
 * would mean the network is innocent.
 */
async function eventLoopLag(): Promise<number> {
  const t = performance.now();
  await new Promise((r) => setTimeout(r, 0));
  return Math.round((performance.now() - t) * 10) / 10;
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!process.env.PERF_TOKEN || token !== process.env.PERF_TOKEN) {
    return new NextResponse("Not found", { status: 404 });
  }

  const isCold = invocations === 0;
  invocations += 1;

  const lagBefore = await eventLoopLag();

  // A tiny endpoint that touches no table: isolates connection + gateway cost
  // from anything the database does.
  const health: { ms: number; note: string }[] = [];
  for (let i = 0; i < 5; i++) health.push(await time(() => hit("/auth/v1/health")));

  // The cheapest possible real query, repeated: a warm connection to PostgREST.
  const rest: { ms: number; note: string }[] = [];
  for (let i = 0; i < 5; i++) {
    rest.push(await time(() => hit("/rest/v1/equipment?select=id&limit=1")));
  }

  // The same five at once, which is the shape the pages now use.
  const parallelStart = performance.now();
  const parallel = await Promise.all(
    Array.from({ length: 5 }, () => time(() => hit("/rest/v1/equipment?select=id&limit=1"))),
  );
  const parallelWall = Math.round((performance.now() - parallelStart) * 10) / 10;

  const jwks = await time(() => hit("/auth/v1/.well-known/jwks.json"));
  const lagAfter = await eventLoopLag();

  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

  return NextResponse.json(
    {
      region: process.env.VERCEL_REGION ?? "unknown",
      coldInvocation: isCold,
      invocationsOnThisInstance: invocations,
      instanceAgeMs: Date.now() - bootedAt,
      eventLoopLagMs: { before: lagBefore, after: lagAfter },
      authHealth: { each: health, medianMs: median(health.map((h) => h.ms)) },
      restSequential: {
        each: rest,
        medianMs: median(rest.map((r) => r.ms)),
        totalMs: Math.round(rest.reduce((n, r) => n + r.ms, 0)),
      },
      restParallel: { each: parallel, wallMs: parallelWall },
      jwks,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
