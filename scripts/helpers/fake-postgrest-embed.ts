/**
 * A small in-memory PostgREST for read queries with embedded resources.
 *
 * Plugs into a REAL supabase-js client via its `fetch` option, so the code
 * under test builds its queries with the real query builder; this side parses
 * the HTTP request PostgREST would get. It supports what loadSessionSummary
 * sends: column and embedded (`rel!inner(cols)`, `alias:rel!hint(cols)`)
 * selects, eq / neq / in / lt filters (dotted ones on an `!inner` embed filter
 * the parent row; lt compares strings, which is right for ISO timestamps),
 * order, offset/limit, `.single()`, and the server's max_rows cap (1000, as in
 * supabase/config.toml). Anything else throws, so a query the fake does not
 * understand fails the test instead of passing silently.
 *
 * A ranged read with NO order comes back in an unspecified order, as Postgres
 * gives no order guarantee across pages: the fake reverses the rows on every
 * other such request, so paging without `.order()` skips or repeats rows.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";

export type Row = Record<string, unknown>;
export const MAX_ROWS = 1000;

/** parent table -> embedded name -> how to join. */
type Rel = { table: string; kind: "one" | "many"; local: string; foreign: string };
export type Relations = Record<string, Record<string, Rel>>;

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

type Sel = { col: string } | { name: string; rel: string; inner: boolean; cols: Sel[] };

function parseSelect(s: string): Sel[] {
  return splitTop(s.replace(/\s+/g, "")).map((tok) => {
    const m = tok.match(/^(?:([a-z_]+):)?([a-z_]+)(?:!([a-z_]+))?\((.*)\)$/);
    if (!m) return { col: tok };
    const [, alias, rel, hint, inner] = m;
    return { name: alias ?? rel, rel, inner: hint === "inner", cols: parseSelect(inner) };
  });
}

function matches(cell: unknown, filter: string): boolean {
  const dot = filter.indexOf(".");
  const op = filter.slice(0, dot);
  const raw = filter.slice(dot + 1);
  const str = cell === null || cell === undefined ? null : String(cell);
  if (op === "eq") return str !== null && str === raw;
  if (op === "neq") return str !== null && str !== raw;
  if (op === "lt") return str !== null && str < raw;
  if (op === "in") {
    const items = raw.replace(/^\(/, "").replace(/\)$/, "").split(",").map((x) => x.replace(/^"|"$/g, ""));
    return str !== null && items.includes(str);
  }
  throw new Error(`fake-postgrest-embed: unsupported operator "${op}"`);
}

export function createEmbedFake(tables: Record<string, Row[]>, relations: Relations) {
  const requests: string[] = [];
  let unorderedRanged = 0;

  function materialize(table: string, row: Row, sel: Sel[]): Row {
    const out: Row = {};
    for (const s of sel) {
      if ("col" in s) {
        if (s.col === "*") Object.assign(out, row);
        else out[s.col] = row[s.col] ?? null;
        continue;
      }
      const rel = relations[table]?.[s.rel];
      if (!rel) throw new Error(`fake-postgrest-embed: no relation ${table}.${s.rel}`);
      const children = (tables[rel.table] ?? []).filter((c) => c[rel.foreign] === row[rel.local]);
      out[s.name] =
        rel.kind === "one"
          ? children[0] ? materialize(rel.table, children[0], s.cols) : null
          : children.map((c) => materialize(rel.table, c, s.cols));
    }
    return out;
  }

  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    if (method !== "GET") throw new Error(`fake-postgrest-embed: read-only, got ${method}`);
    const table = url.pathname.replace(/^\/rest\/v1\//, "");
    requests.push(`${table}?${url.searchParams.toString()}`);
    const sel = parseSelect(url.searchParams.get("select") ?? "*");

    let rows = (tables[table] ?? []).map((r) => ({ raw: r, out: materialize(table, r, sel) }));
    let order: string | null = null;
    let offset = 0;
    let limit: number | null = null;

    for (const [key, value] of url.searchParams.entries()) {
      if (key === "select") continue;
      if (key === "order") { order = value; continue; }
      if (key === "offset") { offset = Number(value); continue; }
      if (key === "limit") { limit = Number(value); continue; }
      if (key.includes(".")) {
        const [embed, col] = key.split(".");
        const s = sel.find((x) => "name" in x && x.name === embed);
        if (!s || !("inner" in s) || !s.inner) throw new Error(`fake-postgrest-embed: filter on non-inner embed ${key}`);
        rows = rows.filter((r) => {
          const e = r.out[embed] as Row | Row[] | null;
          const list = Array.isArray(e) ? e : e ? [e] : [];
          return list.some((x) => {
            if (!(col in x)) throw new Error(`fake-postgrest-embed: ${key} filters a column the embed does not select`);
            return matches(x[col], value);
          });
        });
        continue;
      }
      rows = rows.filter((r) => matches(r.raw[key], value));
    }

    // An !inner embed with no match drops the parent row.
    for (const s of sel) {
      if ("inner" in s && s.inner) rows = rows.filter((r) => {
        const e = r.out[s.name];
        return Array.isArray(e) ? e.length > 0 : e !== null;
      });
    }

    const ranged = url.searchParams.has("offset") || url.searchParams.has("limit");
    if (!order && ranged && unorderedRanged++ % 2 === 1) rows = [...rows].reverse();

    if (order) {
      const [col, dir] = order.split(".");
      const sign = dir === "desc" ? -1 : 1;
      rows = [...rows].sort((a, b) => {
        const av = a.raw[col] as string | number;
        const bv = b.raw[col] as string | number;
        return av < bv ? -sign : av > bv ? sign : 0;
      });
    }

    const capped = Math.min(limit ?? MAX_ROWS, MAX_ROWS);
    const page = rows.slice(offset, offset + capped).map((r) => r.out);

    const accept = new Headers(init?.headers).get("Accept") ?? "";
    if (accept.includes("vnd.pgrst.object")) {
      if (page.length !== 1) {
        return new Response(JSON.stringify({ code: "PGRST116", message: "not one row" }), { status: 406 });
      }
      return new Response(JSON.stringify(page[0]), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify(page), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const client = createClient<Database>("http://fake.local", "fake-anon-key", {
    global: { fetch: fakeFetch as typeof fetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { client: client as SupabaseClient<Database>, requests };
}
