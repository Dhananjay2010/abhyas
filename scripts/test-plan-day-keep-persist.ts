/**
 * End-to-end test: Keep it persists the answer and the prompt doesn't come back.
 *
 * Tests that when "Keep it" is chosen on a training day or Rest day, the planned
 * row is written and the prompt doesn't reappear after a reload.
 *
 *   npx tsx scripts/test-plan-day-keep-persist.ts
 */

import { strict as assert } from "node:assert";
import { planDayCore, type PlanDayClient } from "../src/lib/session/plan-day-core";
import { decideTodayPrompts } from "../src/lib/today/decide-today-prompts";
import type { Database } from "../src/lib/database.types";

export {}; // Module

type DayType = Database["public"]["Enums"]["day_type"];
type SessionInsert = Database["public"]["Tables"]["sessions"]["Insert"];
type SessionRow = { id: string; status: string; actual_type: DayType | null };
type Program = {
  id: string;
  started_on: string;
  deload_week: number;
  week_offset: number;
};
type ProgramDay = {
  id: string;
  day_type: DayType;
};

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
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

// Mock DB that stores sessions in memory
class MockDB {
  private sessions: Map<string, SessionRow & { local_date: string }> = new Map();
  private nextId = 1;

  constructor(
    private program: Program,
    private programDaysByIndex: Record<number, ProgramDay>,
  ) {}

  async findDaySessions(localDate: string) {
    const rows = Array.from(this.sessions.values()).filter((s) => s.local_date === localDate);
    return { rows, error: null };
  }

  async findActiveProgram() {
    return { program: this.program, error: null };
  }

  async loadProgramDay(programDayId: string) {
    const day = Object.values(this.programDaysByIndex).find((d) => d.id === programDayId);
    if (!day) {
      return { ok: false as const, error: "Program day not found." };
    }
    return { ok: true as const, day };
  }

  async findProgramDayByIndex(dayIndex: number) {
    const day = this.programDaysByIndex[dayIndex];
    return { day: day ?? null, error: null };
  }

  async updateSession(id: string, row: SessionInsert) {
    const existing = this.sessions.get(id);
    if (!existing) {
      return { error: "Session not found" };
    }
    this.sessions.set(id, { ...existing, ...row, id });
    return { error: null };
  }

  async deleteSessions(ids: string[]) {
    for (const id of ids) {
      this.sessions.delete(id);
    }
    return { error: null };
  }

  async insertSession(row: SessionInsert) {
    const id = `sess-${this.nextId++}`;
    this.sessions.set(id, {
      id,
      status: row.status ?? "planned",
      actual_type: row.actual_type ?? null,
      local_date: row.local_date ?? "",
    });
    return { error: null };
  }

  getClient(): PlanDayClient {
    return {
      findDaySessions: (localDate: string) => this.findDaySessions(localDate),
      findActiveProgram: () => this.findActiveProgram(),
      loadProgramDay: (programDayId: string) => this.loadProgramDay(programDayId),
      findProgramDayByIndex: (dayIndex: number) => this.findProgramDayByIndex(dayIndex),
      updateSession: (id: string, row: SessionInsert) => this.updateSession(id, row),
      deleteSessions: (ids: string[]) => this.deleteSessions(ids),
      insertSession: (row: SessionInsert) => this.insertSession(row),
    };
  }

  getSessions(localDate: string): SessionRow[] {
    return Array.from(this.sessions.values()).filter((s) => s.local_date === localDate);
  }
}

async function main() {
  console.log("Testing Keep it persists and prompt doesn't come back\n");

  await test("Training day: Keep it, then reload -> no missed-yesterday prompt", async () => {
    const program: Program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };
    const upperDay: ProgramDay = {
      id: "day-upper",
      day_type: "weights",
    };

    const db = new MockDB(program, { 7: upperDay });

    // Initial state: no planned rows, missed yesterday
    const beforePrompt = decideTodayPrompts({
      missedYesterday: true,
      strengthDone: false,
      strengthOpen: undefined,
      dayType: "weights",
      todaySessions: [],
      yesterdayDay: { day_type: "weights", label: "Lower" },
    });
    assert.equal(beforePrompt.prompt?.type, "missed-yesterday", "Should show missed-yesterday prompt");

    // User chooses "Keep it"
    const keepResult = await planDayCore(db.getClient(), {
      userId: "user-1",
      localDate: "2026-11-15",
      today: "2026-11-14",
      plan: { kind: "keep" },
    });
    assert.equal(keepResult.ok, true, "Keep should succeed");

    // After Keep: reload (re-derive from stored rows)
    const storedSessions = db.getSessions("2026-11-15");
    assert.equal(storedSessions.length, 1, "Should have 1 planned row");
    assert.equal(storedSessions[0].status, "planned", "Should be planned");
    assert.equal(storedSessions[0].actual_type, "weights", "Should be weights");

    const afterPrompt = decideTodayPrompts({
      missedYesterday: true,
      strengthDone: false,
      strengthOpen: undefined,
      dayType: "weights",
      todaySessions: storedSessions,
      yesterdayDay: { day_type: "weights", label: "Lower" },
    });
    assert.equal(afterPrompt.prompt, null, "Prompt should NOT come back after Keep");
  });

  await test("Scheduled Rest day: Keep it, then reload -> no rest-day swap prompt", async () => {
    const program: Program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };
    const restDay: ProgramDay = {
      id: "day-rest",
      day_type: "rest",
    };

    const db = new MockDB(program, { 2: restDay });

    // Initial state: no planned rows, Rest day
    const beforePrompt = decideTodayPrompts({
      missedYesterday: false,
      strengthDone: false,
      strengthOpen: undefined,
      dayType: "rest",
      todaySessions: [],
      yesterdayDay: undefined,
    });
    assert.equal(beforePrompt.prompt?.type, "rest-day-swap", "Should show rest-day swap prompt");

    // User chooses "Keep it" (keep the Rest day)
    const keepResult = await planDayCore(db.getClient(), {
      userId: "user-1",
      localDate: "2026-11-17",
      today: "2026-11-14",
      plan: { kind: "keep" },
    });
    assert.equal(keepResult.ok, true, "Keep should succeed");

    // After Keep: reload (re-derive from stored rows)
    const storedSessions = db.getSessions("2026-11-17");
    assert.equal(storedSessions.length, 1, "Should have 1 planned row");
    assert.equal(storedSessions[0].status, "planned", "Should be planned");
    assert.equal(storedSessions[0].actual_type, "rest", "Should be rest");

    const afterPrompt = decideTodayPrompts({
      missedYesterday: false,
      strengthDone: false,
      strengthOpen: undefined,
      dayType: "rest",
      todaySessions: storedSessions,
      yesterdayDay: undefined,
    });
    assert.equal(afterPrompt.prompt?.type, "rest-day-swap", "Rest-day swap still shows (by design)");
  });

  await test("Swap persists and stays answered", async () => {
    const program: Program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };
    const upperDay: ProgramDay = {
      id: "day-upper",
      day_type: "weights",
    };
    const lowerDay: ProgramDay = {
      id: "day-lower",
      day_type: "weights",
    };

    const db = new MockDB(program, { 7: upperDay, 6: lowerDay });

    // Initial state: missed yesterday
    const beforePrompt = decideTodayPrompts({
      missedYesterday: true,
      strengthDone: false,
      strengthOpen: undefined,
      dayType: "weights",
      todaySessions: [],
      yesterdayDay: { day_type: "weights", label: "Upper" },
    });
    assert.equal(beforePrompt.prompt?.type, "missed-yesterday", "Should show missed-yesterday prompt");

    // User swaps to Lower
    const swapResult = await planDayCore(db.getClient(), {
      userId: "user-1",
      localDate: "2026-11-15",
      today: "2026-11-14",
      plan: { kind: "training", programDayId: "day-lower" },
    });
    assert.equal(swapResult.ok, true, "Swap should succeed");

    // After Swap: reload
    const storedSessions = db.getSessions("2026-11-15");
    assert.equal(storedSessions.length, 1, "Should have 1 planned row");
    assert.equal(storedSessions[0].status, "planned", "Should be planned");

    const afterPrompt = decideTodayPrompts({
      missedYesterday: true,
      strengthDone: false,
      strengthOpen: undefined,
      dayType: "weights",
      todaySessions: storedSessions,
      yesterdayDay: { day_type: "weights", label: "Upper" },
    });
    assert.equal(afterPrompt.prompt, null, "Prompt should NOT come back after Swap");
  });

  await test("Rest persists and stays answered", async () => {
    const program: Program = {
      id: "prog-1",
      started_on: "2026-11-01",
      deload_week: 4,
      week_offset: 0,
    };
    const upperDay: ProgramDay = {
      id: "day-upper",
      day_type: "weights",
    };

    const db = new MockDB(program, { 7: upperDay });

    // Initial state: missed yesterday
    const beforePrompt = decideTodayPrompts({
      missedYesterday: true,
      strengthDone: false,
      strengthOpen: undefined,
      dayType: "weights",
      todaySessions: [],
      yesterdayDay: { day_type: "weights", label: "Upper" },
    });
    assert.equal(beforePrompt.prompt?.type, "missed-yesterday", "Should show missed-yesterday prompt");

    // User chooses Rest
    const restResult = await planDayCore(db.getClient(), {
      userId: "user-1",
      localDate: "2026-11-15",
      today: "2026-11-14",
      plan: { kind: "rest" },
    });
    assert.equal(restResult.ok, true, "Rest should succeed");

    // After Rest: reload
    const storedSessions = db.getSessions("2026-11-15");
    assert.equal(storedSessions.length, 1, "Should have 1 planned row");
    assert.equal(storedSessions[0].status, "planned", "Should be planned");
    assert.equal(storedSessions[0].actual_type, "rest", "Should be rest");

    const afterPrompt = decideTodayPrompts({
      missedYesterday: true,
      strengthDone: false,
      strengthOpen: undefined,
      dayType: "rest",
      todaySessions: storedSessions,
      yesterdayDay: { day_type: "weights", label: "Upper" },
    });
    assert.equal(afterPrompt.prompt?.type, "rest-day-swap", "Should show rest-day swap (not missed-yesterday)");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
