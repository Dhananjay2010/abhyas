/**
 * An in-memory PostgREST stand-in for unit tests.
 *
 * It plugs into a real supabase-js client through the client's `fetch`
 * option, so the code under test builds its queries with the real query
 * builder and the test sees the HTTP requests PostgREST would receive: the
 * method, the filters, and the `Prefer` header that marks an upsert. No cast
 * to a Supabase type is needed, because the client is a real one.
 *
 * Unique constraints (optionally partial, like a `where` clause on an index)
 * answer with a 409 and Postgres code 23505, as the real database does.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/lib/database.types";

export type Value = string | number | boolean | null;
export type Row = Record<string, Value>;

export type UniqueConstraint = {
  table: string;
  columns: string[];
  /** Only rows matching this take part, like a partial unique index. */
  where?: (row: Row) => boolean;
};

export type RecordedRequest = {
  method: string;
  table: string;
  /** `column -> raw PostgREST filter`, e.g. `is_warmup_set -> eq.false`. */
  filters: Record<string, string>;
  select: string | null;
  order: string | null;
  limit: string | null;
  prefer: string;
  body: Row[] | Row | null;
};

export type FakeDb = {
  client: SupabaseClient<Database>;
  tables: Record<string, Row[]>;
  requests: RecordedRequest[];
  /**
   * Runs before each request is served. Use it to simulate another request
   * winning a race, e.g. by adding a row just before an insert lands. Return
   * a Response to answer the request yourself, e.g. with a server error.
   */
  beforeRequest: (req: RecordedRequest) => Response | void;
};

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function cellMatches(cell: Value | undefined, filter: string): boolean {
  const dot = filter.indexOf(".");
  const op = filter.slice(0, dot);
  const raw = filter.slice(dot + 1);
  if (op === "eq") return cell !== null && cell !== undefined && String(cell) === raw;
  if (op === "neq") return cell === null || cell === undefined || String(cell) !== raw;
  if (op === "is") return raw === "null" ? cell === null || cell === undefined : String(cell) === raw;
  if (op === "in") {
    const items = raw.replace(/^\(/, "").replace(/\)$/, "").split(",").map((s) => s.replace(/^"|"$/g, ""));
    return cell !== null && cell !== undefined && items.includes(String(cell));
  }
  throw new Error(`fake-postgrest: unsupported filter operator "${op}"`);
}

function project(row: Row, select: string | null): Row {
  if (!select || select === "*") return { ...row };
  const out: Row = {};
  for (const col of select.split(",").map((c) => c.trim()).filter(Boolean)) {
    out[col] = row[col] ?? null;
  }
  return out;
}

function sortRows(rows: Row[], order: string | null): Row[] {
  if (!order) return rows;
  const [col, dir] = order.split(".");
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = a[col];
    const bv = b[col];
    if (av === bv) return 0;
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    return av < bv ? -sign : sign;
  });
}

export function json(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function asRows(body: unknown): Row[] {
  const list = Array.isArray(body) ? body : [body];
  return list.map((item) => {
    const row: Row = {};
    if (item && typeof item === "object") {
      for (const [k, v] of Object.entries(item)) {
        if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") row[k] = v;
      }
    }
    return row;
  });
}

export function createFakeDb(options: {
  tables?: Record<string, Row[]>;
  unique?: UniqueConstraint[];
} = {}): FakeDb {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(options.tables ?? {})) tables[name] = rows.map((r) => ({ ...r }));
  const unique = options.unique ?? [];
  const requests: RecordedRequest[] = [];
  let nextId = 1;

  function violates(table: string, candidate: Row, ignore: Row | null): boolean {
    const rows = tables[table] ?? [];
    return unique
      .filter((u) => u.table === table)
      .some((u) => {
        if (u.where && !u.where(candidate)) return false;
        return rows.some(
          (other) =>
            other !== ignore &&
            (!u.where || u.where(other)) &&
            u.columns.every((c) => (other[c] ?? null) === (candidate[c] ?? null)),
        );
      });
  }

  const conflict = () =>
    json(409, {
      code: "23505",
      message: "duplicate key value violates unique constraint",
      details: null,
      hint: null,
    });

  const db: FakeDb = {
    client: createClient<Database>("http://fake-postgrest.test", "fake-anon-key", {
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
          const req: RecordedRequest = {
            method,
            table,
            filters,
            select: url.searchParams.get("select"),
            order: url.searchParams.get("order"),
            limit: url.searchParams.get("limit"),
            prefer: headers.get("Prefer") ?? "",
            body: parsed === null ? null : Array.isArray(parsed) ? asRows(parsed) : asRows(parsed)[0],
          };
          requests.push(req);
          const override = db.beforeRequest(req);
          if (override) return override;

          const rows = (tables[table] ??= []);
          const matching = () =>
            rows.filter((r) => Object.entries(filters).every(([col, f]) => cellMatches(r[col], f)));
          const wantsObject = (headers.get("Accept") ?? "").includes("vnd.pgrst.object");
          const respond = (out: Row[]) => {
            const shaped = out.map((r) => project(r, req.select));
            if (wantsObject) {
              return shaped.length === 1
                ? json(200, shaped[0])
                : json(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: null, hint: null });
            }
            return json(200, shaped);
          };

          if (method === "GET") {
            let out = sortRows(matching(), req.order);
            if (req.limit) out = out.slice(0, Number(req.limit));
            return respond(out);
          }

          if (method === "POST") {
            const isUpsert = req.prefer.includes("resolution=");
            const incoming = asRows(parsed);
            const written: Row[] = [];
            for (const raw of incoming) {
              const row: Row = { id: `row-${nextId++}`, created_at: new Date(Date.UTC(2026, 9, 24, 0, 0, nextId)).toISOString(), ...raw };
              if (violates(table, row, null)) {
                if (!isUpsert) return conflict();
                const target = rows.find((other) =>
                  unique.some((u) => u.table === table && u.columns.every((c) => (other[c] ?? null) === (row[c] ?? null))),
                );
                if (target) Object.assign(target, raw);
                if (target) written.push(target);
                continue;
              }
              rows.push(row);
              written.push(row);
            }
            return req.prefer.includes("return=representation") ? respond(written) : json(201, undefined);
          }

          if (method === "PATCH") {
            const patch = asRows(parsed)[0] ?? {};
            const targets = matching();
            for (const target of targets) {
              if (violates(table, { ...target, ...patch }, target)) return conflict();
            }
            for (const target of targets) Object.assign(target, patch);
            return req.prefer.includes("return=representation") ? respond(targets) : json(204, undefined);
          }

          if (method === "DELETE") {
            const doomed = new Set(matching());
            tables[table] = rows.filter((r) => !doomed.has(r));
            return json(204, undefined);
          }

          throw new Error(`fake-postgrest: unsupported method ${method}`);
        },
      },
    }),
    tables,
    requests,
    beforeRequest: () => {},
  };
  return db;
}
