/**
 * In-memory PostgREST stand-in for the swap path (findAlternatives,
 * swapExercise, swapExerciseForUser).
 *
 * Like fake-postgrest.ts it plugs into a REAL supabase-js client through the
 * `fetch` option, so the code under test builds its queries with the real
 * query builder. Unlike fake-postgrest.ts it supports array columns
 * (primary_muscles, equipment_ids, ...) and one-level embeds such as
 * `exercises!session_exercises_exercise_id_fkey(movement_pattern, mechanic)`.
 *
 * Every response is projected to the requested `select` columns, exactly as
 * PostgREST does. That is what makes a column dropped from a select visible to
 * a test: the code under test receives the row without it.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";

export type Row = Record<string, unknown>;

export type SwapDbRequest = {
  method: string;
  table: string;
  filters: Record<string, string>;
  select: string | null;
  body: Row | null;
};

export type SwapDb = {
  client: SupabaseClient<Database>;
  tables: Record<string, Row[]>;
  requests: SwapDbRequest[];
  /** Return a Response to answer a request yourself, e.g. a 500 for a fail-closed check. */
  beforeRequest: (req: SwapDbRequest) => Response | void;
};

const RESERVED = new Set(["select", "order", "limit", "offset", "columns"]);

/** Embedded resources: alias or `table!fkey` -> [table, local fk column]. */
const EMBEDS: Record<string, { table: string; fk: string }> = {
  "exercises!session_exercises_exercise_id_fkey": { table: "exercises", fk: "exercise_id" },
  exercises: { table: "exercises", fk: "exercise_id" },
};

function splitTopLevel(select: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of select) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function cellMatches(cell: unknown, filter: string): boolean {
  const dot = filter.indexOf(".");
  const op = filter.slice(0, dot);
  const raw = filter.slice(dot + 1);
  if (op === "eq") return cell !== null && cell !== undefined && String(cell) === raw;
  if (op === "in") {
    const items = raw.replace(/^\(/, "").replace(/\)$/, "").split(",").map((s) => s.replace(/^"|"$/g, ""));
    return cell !== null && cell !== undefined && items.includes(String(cell));
  }
  throw new Error(`fake-swap-db: unsupported filter operator "${op}"`);
}

export function json(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function createSwapDb(initial: Record<string, Row[]>): SwapDb {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(initial)) tables[name] = rows.map((r) => ({ ...r }));
  const requests: SwapDbRequest[] = [];

  function project(row: Row, select: string | null): Row {
    if (!select || select === "*") return { ...row };
    const out: Row = {};
    for (const part of splitTopLevel(select)) {
      const open = part.indexOf("(");
      if (open === -1) {
        out[part] = row[part] ?? null;
        continue;
      }
      const name = part.slice(0, open);
      const embed = EMBEDS[name];
      if (!embed) throw new Error(`fake-swap-db: unsupported embed "${name}"`);
      const target = (tables[embed.table] ?? []).find((r) => r.id === row[embed.fk]);
      out[embed.table] = target ? project(target, part.slice(open + 1, -1)) : null;
    }
    return out;
  }

  const db: SwapDb = {
    client: createClient<Database>("http://fake-swap-db.test", "fake-anon-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
          const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
          const method = (init?.method ?? "GET").toUpperCase();
          const headers = new Headers(init?.headers);
          const table = url.pathname.replace(/^\/rest\/v1\//, "");
          const filters: Record<string, string> = {};
          url.searchParams.forEach((value, key) => {
            if (!RESERVED.has(key)) filters[key] = value;
          });
          const bodyText = typeof init?.body === "string" ? init.body : null;
          const parsed: unknown = bodyText ? JSON.parse(bodyText) : null;
          const req: SwapDbRequest = {
            method,
            table,
            filters,
            select: url.searchParams.get("select"),
            body: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...parsed } : null,
          };
          requests.push(req);
          const override = db.beforeRequest(req);
          if (override) return override;

          const rows = (tables[table] ??= []);
          const matching = rows.filter((r) => Object.entries(filters).every(([col, f]) => cellMatches(r[col], f)));

          if (method === "GET") {
            let out = matching;
            const order = url.searchParams.get("order");
            if (order) {
              const [col, dir] = order.split(".");
              const sign = dir === "desc" ? -1 : 1;
              out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -sign : String(a[col]) > String(b[col]) ? sign : 0));
            }
            const limit = url.searchParams.get("limit");
            if (limit) out = out.slice(0, Number(limit));
            const shaped = out.map((r) => project(r, req.select));
            if ((headers.get("Accept") ?? "").includes("vnd.pgrst.object")) {
              return shaped.length === 1
                ? json(200, shaped[0])
                : json(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: null, hint: null });
            }
            return json(200, shaped);
          }

          if (method === "PATCH") {
            for (const target of matching) Object.assign(target, req.body ?? {});
            return json(204, undefined);
          }

          throw new Error(`fake-swap-db: unsupported method ${method}`);
        },
      },
    }),
    tables,
    requests,
    beforeRequest: () => {},
  };
  return db;
}
