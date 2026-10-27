#!/usr/bin/env tsx
/**
 * Behavioural test: the REAL createBlockForUser anchors only a brand-new block 1.
 *
 * Drives createBlockForUser through a real supabase-js client (createClient)
 * whose fetch is a typed stub. The stub answers PostgREST requests and records
 * the weekday indices that get written:
 *   - new block 1 / new block 2: rows POSTed to /program_days
 *   - rebuild: p_payload.days sent to /rpc/rebuild_block
 *
 * Clock: options.now = Thursday 2026-10-29 (UTC profile timezone); the rebuild
 * cases run on Monday 2026-10-26 so "anchor to today" would give a different week.
 * Expected training weekdays for a 3-day plan:
 *   - new block 1                          -> [1,4,6] (anchored to Thursday)
 *   - mid-block rebuild of block 1         -> [1,4,6] (keeps block 1's Thursday anchor;
 *                                             #168 changed this from main's [1,3,5])
 *   - second rebuild of block 1            -> [1,4,6] (anchor = earliest block-1 start,
 *                                             not the Tuesday an earlier rebuild under
 *                                             migration 20261025000023 started the row on)
 *   - rebuild of a pre-#165 block 1        -> [1,3,5] (started Thu, laid out on the
 *                                             default; a rebuild never moves weekdays)
 *   - rebuild of block 2                   -> [1,3,5] (block 2+ is never anchored)
 *   - new block 2                          -> [1,3,5] (default mapping)
 *
 * PostgREST detail that matters: `.single()` sends
 * `Accept: application/vnd.pgrst.object+json` and supabase-js returns the body
 * as-is, so the stub must answer with a single JSON object, not an array.
 * (`.maybeSingle()` accepts an array of 0 or 1 rows.)
 */

import { strict as assert } from "node:assert";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { createBlockForUser } from "../src/lib/program/persist";
import catalogueFixture from "./fixtures/catalogue.json";

const THURSDAY = new Date("2026-10-29T06:00:00Z");
const MONDAY = new Date("2026-10-26T06:00:00Z");

type Recorded = {
  insertedDays: Array<{ dayIndex: number; dayType: string }>;
  rpc: Array<{ name: string; days: Array<{ dayIndex: number; dayType: string }> }>;
};

function toDays(value: unknown): Array<{ dayIndex: number; dayType: string }> {
  if (!Array.isArray(value)) return [];
  const out: Array<{ dayIndex: number; dayType: string }> = [];
  for (const row of value) {
    if (typeof row !== "object" || row === null) continue;
    if (!("day_index" in row) || !("day_type" in row)) continue;
    const { day_index, day_type } = row;
    if (typeof day_index === "number" && typeof day_type === "string") {
      out.push({ dayIndex: day_index, dayType: day_type });
    }
  }
  return out;
}

function payloadDays(body: unknown): Array<{ dayIndex: number; dayType: string }> {
  if (typeof body !== "object" || body === null || !("p_payload" in body)) return [];
  const payload = body.p_payload;
  if (typeof payload !== "object" || payload === null || !("days" in payload)) return [];
  return toDays(payload.days);
}

function trainingWeekdays(days: Array<{ dayIndex: number; dayType: string }>): number[] {
  return days
    .filter((d) => d.dayType === "weights" || d.dayType === "bodyweight")
    .map((d) => d.dayIndex)
    .sort((a, b) => a - b);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Answer a read the way PostgREST would for the request's Accept header. */
function rows(data: unknown[], accept: string): Response {
  if (accept.includes("vnd.pgrst.object")) {
    if (data.length !== 1) {
      return json({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: "", hint: null }, 406);
    }
    return json(data[0]);
  }
  return json(data);
}

function buildClient(cfg: {
  lastBlockNumber: number | null;
  activeBlock: { block_number: number; started_on: string } | null;
  /** Every block-1 row (superseded ones included), for the anchor read. */
  block1Rows?: Array<{ id: string; started_on: string; status: string }>;
  /** Training weekdays of the ACTIVE block-1 row's program_days (the layout signal). */
  activeTrainingDays?: number[];
}) {
  const recorded: Recorded = { insertedDays: [], rpc: [] };

  const stubFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const accept = new Headers(init?.headers).get("accept") ?? "";
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    const path = url.pathname;

    if (path.includes("/rpc/")) {
      const name = path.split("/rpc/")[1] ?? "";
      recorded.rpc.push({ name, days: payloadDays(body) });
      return json("prog-rpc-1");
    }

    if (method === "POST" && path.endsWith("/programs")) {
      return rows([{ id: "prog-1" }], accept);
    }
    if (method === "POST" && path.endsWith("/program_days")) {
      const days = toDays(body);
      recorded.insertedDays.push(...days);
      return rows(days.map((d, i) => ({ id: `pd-${i}`, day_index: d.dayIndex })), accept);
    }
    if (method === "POST" && path.endsWith("/program_day_exercises")) {
      return new Response(null, { status: 201 });
    }
    if (method === "PATCH") {
      return new Response(null, { status: 204 });
    }

    // Reads
    if (path.endsWith("/profiles")) {
      return rows([{
        id: "user-1",
        goal: "general_fitness",
        level: "beginner",
        primary_track: "weights",
        days_per_week: 3,
        yoga_days_per_week: 0,
        date_of_birth: "1990-01-01",
        height_cm: 175,
        has_all_equipment: true,
        preferred_session_minutes: 45,
        timezone: "UTC",
      }], accept);
    }
    if (path.endsWith("/body_metrics")) return rows([{ weight_kg: 75 }], accept);
    if (path.endsWith("/user_equipment")) return rows([], accept);
    if (path.endsWith("/user_injuries")) return rows([], accept);
    if (path.endsWith("/program_days")) {
      const active = (cfg.block1Rows ?? []).find((r) => r.status === "active");
      if (!active || url.searchParams.get("program_id") !== `eq.${active.id}`) return rows([], accept);
      const train = cfg.activeTrainingDays ?? [];
      return rows([1, 2, 3, 4, 5, 6, 7].map((d) => ({ day_index: d, day_type: train.includes(d) ? "weights" : "rest" })), accept);
    }
    if (path.endsWith("/exercises")) return rows(catalogueFixture, accept);
    if (path.endsWith("/programs")) {
      if (url.searchParams.get("status") === "eq.active") {
        return rows(cfg.activeBlock ? [cfg.activeBlock] : [], accept);
      }
      if (url.searchParams.get("block_number") === "eq.1") {
        return rows([...(cfg.block1Rows ?? [])].sort((a, b) => a.started_on.localeCompare(b.started_on)), accept);
      }
      return rows(cfg.lastBlockNumber === null ? [] : [{ block_number: cfg.lastBlockNumber }], accept);
    }
    return rows([], accept);
  };

  const client = createClient<Database>("http://stub.local", "anon-key", {
    global: { fetch: stubFetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { client, recorded };
}

async function main() {
  console.log("\ncreateBlockForUser anchoring (real function, stubbed PostgREST, Thu 2026-10-29)\n");

  console.log("1. New block 1 -> [1,4,6]");
  {
    const { client, recorded } = buildClient({ lastBlockNumber: null, activeBlock: null });
    const result = await createBlockForUser(client, "user-1", { now: THURSDAY });
    assert.ok(result.ok, `new block 1 should build: ${JSON.stringify(result)}`);
    assert.strictEqual(result.blockNumber, 1, "first build must be block 1");
    assert.strictEqual(recorded.insertedDays.length, 7, "a block writes 7 program_days rows");
    assert.deepStrictEqual(
      trainingWeekdays(recorded.insertedDays),
      [1, 4, 6],
      "new block 1 on Thursday must anchor training days to [1,4,6]",
    );
    console.log("  ✓ inserted training weekdays [1,4,6]");
  }

  console.log("2. Mid-block rebuild of block 1 (anchored Thu 2026-10-15, rebuilt Mon 2026-10-26) -> [1,4,6]");
  {
    const { client, recorded } = buildClient({
      lastBlockNumber: 1,
      activeBlock: { block_number: 1, started_on: "2026-10-15" },
      block1Rows: [{ id: "b1", started_on: "2026-10-15", status: "active" }],
      activeTrainingDays: [1, 4, 6],
    });
    const result = await createBlockForUser(client, "user-1", { mode: "rebuild", now: MONDAY });
    assert.ok(result.ok, `rebuild should succeed: ${JSON.stringify(result)}`);
    assert.strictEqual(result.blockNumber, 1, "rebuild keeps block number 1");
    assert.strictEqual(recorded.rpc.length, 1, "rebuild goes through one RPC call");
    assert.strictEqual(recorded.rpc[0]?.name, "rebuild_block", "rebuild must call rebuild_block");
    assert.strictEqual(recorded.insertedDays.length, 0, "rebuild must not insert program_days directly");
    assert.deepStrictEqual(
      trainingWeekdays(recorded.rpc[0]?.days ?? []),
      [1, 4, 6],
      "mid-block rebuild of block 1 must keep the Thursday-anchored [1,4,6] weekdays",
    );
    console.log("  ✓ rebuild_block payload training weekdays [1,4,6]");
  }

  // Today's rebuild_block (20261025000025) keeps started_on mid-block; this active row
  // was rebuilt under 20261025000023, which started it on the rebuild day.
  console.log("2b. Second rebuild of block 1 (active row started Tue 2026-10-20 by an older rebuild) -> [1,4,6]");
  {
    const { client, recorded } = buildClient({
      lastBlockNumber: 1,
      activeBlock: { block_number: 1, started_on: "2026-10-20" },
      block1Rows: [
        { id: "b1b", started_on: "2026-10-20", status: "active" },
        { id: "b1a", started_on: "2026-10-15", status: "superseded" },
      ],
      activeTrainingDays: [1, 4, 6],
    });
    const result = await createBlockForUser(client, "user-1", { mode: "rebuild", now: MONDAY });
    assert.ok(result.ok, `second rebuild should succeed: ${JSON.stringify(result)}`);
    assert.strictEqual(recorded.rpc[0]?.name, "rebuild_block", "second rebuild must call rebuild_block");
    assert.deepStrictEqual(
      trainingWeekdays(recorded.rpc[0]?.days ?? []),
      [1, 4, 6],
      "a second rebuild must anchor to block 1's first start (Thu), not the Tuesday row",
    );
    console.log("  ✓ rebuild_block payload training weekdays [1,4,6]");
  }

  console.log("2c. Rebuild of block 2 (started Thu 2026-10-15) -> [1,3,5]");
  {
    const { client, recorded } = buildClient({
      lastBlockNumber: 2,
      activeBlock: { block_number: 2, started_on: "2026-10-15" },
      block1Rows: [{ id: "b1", started_on: "2026-09-17", status: "completed" }],
    });
    const result = await createBlockForUser(client, "user-1", { mode: "rebuild", now: MONDAY });
    assert.ok(result.ok, `block 2 rebuild should succeed: ${JSON.stringify(result)}`);
    assert.strictEqual(result.blockNumber, 2, "rebuild keeps block number 2");
    assert.deepStrictEqual(
      trainingWeekdays(recorded.rpc[0]?.days ?? []),
      [1, 3, 5],
      "rebuild of block 2 must keep the default [1,3,5] mapping",
    );
    console.log("  ✓ rebuild_block payload training weekdays [1,3,5]");
  }

  console.log("2d. Rebuild of a pre-#165 block 1 (started Thu 2026-10-15, laid out Mon/Wed/Fri) -> [1,3,5]");
  {
    const { client, recorded } = buildClient({
      lastBlockNumber: 1,
      activeBlock: { block_number: 1, started_on: "2026-10-15" },
      block1Rows: [{ id: "b1", started_on: "2026-10-15", status: "active" }],
      activeTrainingDays: [1, 3, 5],
    });
    const result = await createBlockForUser(client, "user-1", { mode: "rebuild", now: MONDAY });
    assert.ok(result.ok, `pre-#165 rebuild should succeed: ${JSON.stringify(result)}`);
    assert.strictEqual(recorded.rpc[0]?.name, "rebuild_block", "pre-#165 rebuild must call rebuild_block");
    assert.deepStrictEqual(
      trainingWeekdays(recorded.rpc[0]?.days ?? []),
      [1, 3, 5],
      "a pre-#165 (unanchored) block 1 must keep [1,3,5] on rebuild, not move to its Thursday start",
    );
    console.log("  ✓ rebuild_block payload training weekdays [1,3,5]");
  }

  console.log("3. New block 2 -> [1,3,5]");
  {
    const { client, recorded } = buildClient({ lastBlockNumber: 1, activeBlock: null });
    const result = await createBlockForUser(client, "user-1", { now: THURSDAY });
    assert.ok(result.ok, `new block 2 should build: ${JSON.stringify(result)}`);
    assert.strictEqual(result.blockNumber, 2, "next build after block 1 must be block 2");
    assert.deepStrictEqual(
      trainingWeekdays(recorded.insertedDays),
      [1, 3, 5],
      "new block 2 must keep the default [1,3,5] mapping",
    );
    console.log("  ✓ inserted training weekdays [1,3,5]");
  }

  console.log("\n✓ createBlockForUser anchoring tests passed\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
