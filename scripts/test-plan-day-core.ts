/**
 * Test planDayCore with fake client recording all DB calls (L7 behavioral).
 *
 *   npx tsx scripts/test-plan-day-core.ts
 */

import { strict as assert } from "node:assert";
import { planDayCore, type PlanDayClient } from "../src/lib/session/plan-day-core";
import type { Database } from "../src/lib/database.types";

export {}; // Module

type SessionRow = Pick<
  Database["public"]["Tables"]["sessions"]["Row"],
  "id" | "actual_type" | "status"
>;
type SessionInsert = Database["public"]["Tables"]["sessions"]["Insert"];

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

type Call =
  | { method: "findDaySessions"; args: [string] }
  | { method: "deleteSessions"; args: [string[]] }
  | { method: "insertSession"; args: [SessionInsert] };

function createFakeClient(existingSessions: SessionRow[] = []): {
  client: PlanDayClient;
  calls: Call[];
} {
  const calls: Call[] = [];

  const client: PlanDayClient = {
    async findDaySessions(localDate: string) {
      calls.push({ method: "findDaySessions", args: [localDate] });
      return { rows: existingSessions, error: null };
    },
    async deleteSessions(ids: string[]) {
      calls.push({ method: "deleteSessions", args: [ids] });
      return { error: null };
    },
    async insertSession(row) {
      calls.push({ method: "insertSession", args: [row] });
      return { error: null };
    },
  };

  return { client, calls };
}

async function main() {
  console.log("Testing planDayCore\n");

  await test("(a) Keep on existing training override: ZERO writes", async () => {
    const existing: SessionRow[] = [{ id: "sess-1", actual_type: "weights", status: "planned" }];
    const { client, calls } = createFakeClient(existing);

    const result = await planDayCore(client, "user-1", {
      localDate: "2026-11-01",
      plan: { kind: "keep" },
    }, "2026-11-01");

    assert.equal(result.ok, true, "Should succeed");
    const writes = calls.filter(c => c.method === "deleteSessions" || c.method === "insertSession");
    assert.equal(writes.length, 0, "Keep must make ZERO delete/insert calls");
  });

  await test("(a) Keep on existing yoga override: ZERO writes", async () => {
    const existing: SessionRow[] = [{ id: "sess-2", actual_type: "yoga", status: "planned" }];
    const { client, calls } = createFakeClient(existing);

    const result = await planDayCore(client, "user-1", {
      localDate: "2026-11-01",
      plan: { kind: "keep" },
    }, "2026-11-01");

    assert.equal(result.ok, true);
    const writes = calls.filter(c => c.method === "deleteSessions" || c.method === "insertSession");
    assert.equal(writes.length, 0, "Keep on yoga must make ZERO writes");
  });

  await test("(a) Keep on existing breathing override: ZERO writes", async () => {
    const existing: SessionRow[] = [{ id: "sess-3", actual_type: "meditation", status: "planned" }];
    const { client, calls } = createFakeClient(existing);

    const result = await planDayCore(client, "user-1", {
      localDate: "2026-11-01",
      plan: { kind: "keep" },
    }, "2026-11-01");

    assert.equal(result.ok, true);
    const writes = calls.filter(c => c.method === "deleteSessions" || c.method === "insertSession");
    assert.equal(writes.length, 0, "Keep on breathing must make ZERO writes");
  });

  await test("(a) Keep on existing rest override: ZERO writes", async () => {
    const existing: SessionRow[] = [{ id: "sess-4", actual_type: "rest", status: "planned" }];
    const { client, calls } = createFakeClient(existing);

    const result = await planDayCore(client, "user-1", {
      localDate: "2026-11-01",
      plan: { kind: "keep" },
    }, "2026-11-01");

    assert.equal(result.ok, true);
    const writes = calls.filter(c => c.method === "deleteSessions" || c.method === "insertSession");
    assert.equal(writes.length, 0, "Keep on rest must make ZERO writes");
  });

  await test("(b) null plan: ok:false with zero writes", async () => {
    const { client, calls } = createFakeClient();

    const result = await planDayCore(client, "user-1", {
      localDate: "2026-11-01",
      plan: null,
    }, "2026-11-01");

    assert.equal(result.ok, false, "null plan should fail");
    assert(result.ok === false && result.error.includes("No plan"), "Error mentions no plan");
    const writes = calls.filter(c => c.method === "deleteSessions" || c.method === "insertSession");
    assert.equal(writes.length, 0, "Failed validation must make ZERO writes");
  });

  await test("(b) missing plan: ok:false with zero writes", async () => {
    const { client, calls } = createFakeClient();

    const result = await planDayCore(client, "user-1", {
      localDate: "2026-11-01",
      plan: undefined,
    }, "2026-11-01");

    assert.equal(result.ok, false);
    const writes = calls.filter(c => c.method === "deleteSessions" || c.method === "insertSession");
    assert.equal(writes.length, 0, "Missing plan must make ZERO writes");
  });

  await test("(b) empty object plan: ok:false with zero writes", async () => {
    const { client, calls } = createFakeClient();

    const result = await planDayCore(client, "user-1", {
      localDate: "2026-11-01",
      plan: {},
    }, "2026-11-01");

    assert.equal(result.ok, false);
    assert(result.ok === false && result.error.includes("kind"), "Error mentions kind");
    const writes = calls.filter(c => c.method === "deleteSessions" || c.method === "insertSession");
    assert.equal(writes.length, 0, "Empty plan must make ZERO writes");
  });

  await test("(c) Normal swap (training): deletes old, inserts new", async () => {
    const existing: SessionRow[] = [{ id: "old-1", actual_type: "rest", status: "planned" }];
    const { client, calls } = createFakeClient(existing);

    const result = await planDayCore(client, "user-1", {
      localDate: "2026-11-01",
      plan: { kind: "training" },
    }, "2026-11-01");

    assert.equal(result.ok, true, "Swap should succeed");
    const deletes = calls.filter(c => c.method === "deleteSessions");
    const inserts = calls.filter(c => c.method === "insertSession");
    assert.equal(deletes.length, 1, "Should delete old session");
    assert.equal(inserts.length, 1, "Should insert new session");
  });

  await test("(c) Swap to rest: deletes old, inserts rest", async () => {
    const existing: SessionRow[] = [{ id: "old-2", actual_type: "weights", status: "planned" }];
    const { client, calls } = createFakeClient(existing);

    const result = await planDayCore(client, "user-1", {
      localDate: "2026-11-01",
      plan: { kind: "rest" },
    }, "2026-11-01");

    assert.equal(result.ok, true);
    const deletes = calls.filter(c => c.method === "deleteSessions");
    const inserts = calls.filter(c => c.method === "insertSession");
    assert.equal(deletes.length, 1, "Should delete old training");
    assert.equal(inserts.length, 1, "Should insert rest");

    const insertCall = inserts[0];
    if (insertCall.method === "insertSession") {
      const inserted = insertCall.args[0];
      assert.equal(inserted.actual_type, "rest", "Inserted row should be rest");
    } else {
      assert.fail("Expected insertSession call");
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
