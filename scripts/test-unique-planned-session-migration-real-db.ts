/**
 * Real database test: unique index on (user_id, local_date) WHERE status='planned'
 *
 * Verifies migration 20261025000033:
 * - Dedupes planned sessions per (user_id, local_date)
 * - Ranks by: has sets DESC, has exercises DESC, has breathing DESC, created_at ASC, id ASC
 * - Keeps rank 1 as planned
 * - DELETEs childless duplicates
 * - UPDATEs data-bearing duplicates to status='skipped'
 * - Zero child rows lost (session_exercises, session_sets, breathing_logs)
 * - Re-running the dedupe changes nothing (idempotent)
 *
 * Cases a..h are QA Bot 1's seed cases for PR #160; case i isolates the has-sets rank.
 * Everything runs in one transaction that is always rolled back.
 *
 * Note: node-postgres parses DATE columns into JS Date objects, so every
 * local_date is selected as text before comparing with 'YYYY-MM-DD' strings.
 *
 * Run: REAL_DB=1 npm run test:unique-planned-session-migration-real-db
 */

import { readFileSync } from "fs";
import { Client } from "pg";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const dbUrl = SUPABASE_URL.replace("http://", "postgresql://postgres:postgres@").replace(":54321", ":54322/postgres");

const MIGRATION_PATH = "supabase/migrations/20261025000033_unique_planned_session_per_user_day.sql";

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "ok" : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

type SessionRow = { id: string; local_date: string; status: string };
type ChildCounts = { id: string; ex: number; sets: number; breath: number };

type CaseSpec = {
  name: string;
  localDates: string[];
  keptPlanned: string[];
  skipped: string[];
  deleted: string[];
  untouched: { id: string; status: string }[];
};

const USER_ID = "00000000-1111-2222-3333-444444444444";
const PROGRAM_ID = "16000000-0000-0000-0000-0000000000a1";
const PROGRAM_DAY_ID = "16000000-0000-0000-0000-0000000000a2";

const T0 = "2026-11-15T10:00:00Z";
const T1 = "2026-11-15T10:30:00Z";
const T2 = "2026-11-15T11:00:00Z";

const ID = {
  a1: "a0000000-0000-0000-0000-000000000001",
  a2: "a0000000-0000-0000-0000-000000000002",
  b1: "b0000000-0000-0000-0000-000000000001",
  b2: "b0000000-0000-0000-0000-000000000002",
  b2a: "b2000000-0000-0000-0000-000000000003",
  b2b: "b2000000-0000-0000-0000-000000000004",
  c1: "c0000000-0000-0000-0000-000000000001",
  c2: "c0000000-0000-0000-0000-000000000002",
  d1: "d0000000-0000-0000-0000-000000000001",
  d2: "d0000000-0000-0000-0000-000000000002",
  d3: "d0000000-0000-0000-0000-000000000003",
  d4: "d0000000-0000-0000-0000-000000000004",
  d5: "d0000000-0000-0000-0000-000000000005",
  d6: "d0000000-0000-0000-0000-000000000006",
  e1: "e0000000-0000-0000-0000-000000000001",
  e2: "e0000000-0000-0000-0000-000000000002",
  e3: "e0000000-0000-0000-0000-000000000003",
  f1: "f0000000-0000-0000-0000-000000000001",
  f2: "f0000000-0000-0000-0000-000000000002",
  f3: "f0000000-0000-0000-0000-000000000003",
  g1: "10000000-0000-0000-0000-000000000001",
  g2: "00000000-0000-0000-0000-0000000000f2",
  h1: "80000000-0000-0000-0000-000000000001",
  h2: "80000000-0000-0000-0000-000000000002",
  h3: "80000000-0000-0000-0000-000000000003",
  i1: "90000000-0000-0000-0000-000000000001",
  i2: "90000000-0000-0000-0000-000000000002",
} as const;

// [id, local_date, status, created_at]
const SESSIONS: [string, string, string, string][] = [
  // (a) pure dup: two empty planned rows
  [ID.a1, "2026-11-20", "planned", T0],
  [ID.a2, "2026-11-20", "planned", T1],
  // (b) higher id has 2 exercises and 3 sets, same created_at
  [ID.b1, "2026-11-21", "planned", T0],
  [ID.b2, "2026-11-21", "planned", T0],
  // (b2) realistic shape: higher id has 1 exercise and 0 sets
  [ID.b2a, "2026-11-22", "planned", T0],
  [ID.b2b, "2026-11-22", "planned", T0],
  // (c) both logged: older 1 exercise + 2 sets, newer 2 exercises + 3 sets
  [ID.c1, "2026-11-23", "planned", T0],
  [ID.c2, "2026-11-23", "planned", T1],
  // (d) mixed statuses: only the planned pair is deduped
  [ID.d1, "2026-11-24", "completed", T0],
  [ID.d2, "2026-11-24", "in_progress", T0],
  [ID.d3, "2026-11-24", "planned", T0],
  [ID.d4, "2026-11-24", "planned", T0],
  [ID.d5, "2026-11-24", "skipped", T0],
  [ID.d6, "2026-11-24", "completed", T0],
  // (e) day boundary: same UTC day, different stored local_date; dup only on the 2nd date
  [ID.e1, "2026-11-25", "planned", "2026-11-24T18:20:00Z"],
  [ID.e2, "2026-11-26", "planned", "2026-11-24T18:40:00Z"],
  [ID.e3, "2026-11-26", "planned", "2026-11-24T18:50:00Z"],
  // (f) breathing: empty oldest, breathing_log rows newer
  [ID.f1, "2026-11-27", "planned", T0],
  [ID.f2, "2026-11-27", "planned", T1],
  [ID.f3, "2026-11-27", "planned", T2],
  // (g) uuid vs age: lowest uuid is the NEWER empty row, older row has an exercise
  [ID.g1, "2026-11-28", "planned", T0],
  [ID.g2, "2026-11-28", "planned", T1],
  // (h) three planned, the middle one has 1 exercise and 2 sets
  [ID.h1, "2026-11-29", "planned", T0],
  [ID.h2, "2026-11-29", "planned", T1],
  [ID.h3, "2026-11-29", "planned", T2],
  // (i) has-sets rank: older has an exercise but no sets, newer has an exercise with sets
  [ID.i1, "2026-11-30", "planned", T0],
  [ID.i2, "2026-11-30", "planned", T1],
];

// [session_id, number of exercises, sets per exercise]
const EXERCISES: [string, number, number][] = [
  [ID.b2, 2, 0], // sets added below so the total is 3
  [ID.b2b, 1, 0],
  [ID.c1, 1, 2],
  [ID.c2, 2, 0], // sets added below so the total is 3
  [ID.d1, 1, 2],
  [ID.d2, 1, 1],
  [ID.g1, 1, 0],
  [ID.h2, 1, 2],
  [ID.i1, 1, 0],
  [ID.i2, 1, 1],
];

const BREATHING: string[] = [ID.f2, ID.f3];

const CASES: CaseSpec[] = [
  { name: "(a) pure dup", localDates: ["2026-11-20"], keptPlanned: [ID.a1], skipped: [], deleted: [ID.a2], untouched: [] },
  { name: "(b) higher id logged", localDates: ["2026-11-21"], keptPlanned: [ID.b2], skipped: [], deleted: [ID.b1], untouched: [] },
  { name: "(b2) exercise, no sets", localDates: ["2026-11-22"], keptPlanned: [ID.b2b], skipped: [], deleted: [ID.b2a], untouched: [] },
  { name: "(c) both logged", localDates: ["2026-11-23"], keptPlanned: [ID.c1], skipped: [ID.c2], deleted: [], untouched: [] },
  {
    name: "(d) mixed statuses",
    localDates: ["2026-11-24"],
    keptPlanned: [ID.d3],
    skipped: [],
    deleted: [ID.d4],
    untouched: [
      { id: ID.d1, status: "completed" },
      { id: ID.d2, status: "in_progress" },
      { id: ID.d5, status: "skipped" },
      { id: ID.d6, status: "completed" },
    ],
  },
  { name: "(e) day boundary", localDates: ["2026-11-25", "2026-11-26"], keptPlanned: [ID.e1, ID.e2], skipped: [], deleted: [ID.e3], untouched: [] },
  { name: "(f) breathing", localDates: ["2026-11-27"], keptPlanned: [ID.f2], skipped: [ID.f3], deleted: [ID.f1], untouched: [] },
  { name: "(g) uuid vs age", localDates: ["2026-11-28"], keptPlanned: [ID.g1], skipped: [], deleted: [ID.g2], untouched: [] },
  { name: "(h) three planned", localDates: ["2026-11-29"], keptPlanned: [ID.h2], skipped: [], deleted: [ID.h1, ID.h3], untouched: [] },
  { name: "(i) sets outrank exercises", localDates: ["2026-11-30"], keptPlanned: [ID.i2], skipped: [ID.i1], deleted: [], untouched: [] },
];

const EXPECTED_DELETED = CASES.reduce((n, c) => n + c.deleted.length, 0);
const EXPECTED_SKIPPED = CASES.reduce((n, c) => n + c.skipped.length, 0);

function sameSet(a: string[], b: string[]): boolean {
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

async function seed(client: Client) {
  await client.query(
    `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
     VALUES ($1, 'test-migration-160@example.com', 'dummy', now(), now(), now())`,
    [USER_ID],
  );
  await client.query(
    `INSERT INTO programs (id, user_id, goal, level, primary_track, split_type, days_per_week, deload_week, started_on, ends_on, block_number, week_offset, status)
     VALUES ($1, $2, 'strength', 'intermediate', 'weights', 'upper_lower', 3, 4, '2026-11-01', '2026-12-19', 1, 0, 'active')`,
    [PROGRAM_ID, USER_ID],
  );
  await client.query(
    `INSERT INTO program_days (id, program_id, user_id, day_index, day_type, status)
     VALUES ($1, $2, $3, 1, 'weights', 'active')`,
    [PROGRAM_DAY_ID, PROGRAM_ID, USER_ID],
  );

  for (const [id, localDate, status, createdAt] of SESSIONS) {
    await client.query(
      `INSERT INTO sessions (id, user_id, program_id, program_day_id, local_date, status, planned_type, week_in_block, is_deload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::session_status, 'weights', 1, false, $7)`,
      [id, USER_ID, PROGRAM_ID, PROGRAM_DAY_ID, localDate, status, createdAt],
    );
  }

  const exerciseId = (await client.query<{ id: string }>("SELECT id FROM exercises ORDER BY id LIMIT 1")).rows[0]?.id;
  if (exerciseId === undefined) throw new Error("No exercises in the database; run the seed first");

  const firstExercise = new Map<string, string>();
  for (const [sessionId, count, setsEach] of EXERCISES) {
    for (let order = 0; order < count; order++) {
      const row = await client.query<{ id: string }>(
        `INSERT INTO session_exercises (session_id, user_id, exercise_id, order_index, status, planned_sets)
         VALUES ($1, $2, $3, $4, 'pending', 3) RETURNING id`,
        [sessionId, USER_ID, exerciseId, order],
      );
      const seId = row.rows[0]?.id;
      if (seId === undefined) throw new Error("session_exercises insert returned no id");
      if (order === 0) firstExercise.set(sessionId, seId);
      for (let set = 1; set <= setsEach; set++) {
        await client.query(
          `INSERT INTO session_sets (user_id, session_exercise_id, set_number, reps, weight_kg, is_warmup_set)
           VALUES ($1, $2, $3, 10, 100, false)`,
          [USER_ID, seId, set],
        );
      }
    }
  }

  // (b) and (c): 3 sets on the newer row, spread over its first exercise
  for (const sessionId of [ID.b2, ID.c2]) {
    const seId = firstExercise.get(sessionId);
    if (seId === undefined) throw new Error(`no exercise seeded for ${sessionId}`);
    for (let set = 1; set <= 3; set++) {
      await client.query(
        `INSERT INTO session_sets (user_id, session_exercise_id, set_number, reps, weight_kg, is_warmup_set)
         VALUES ($1, $2, $3, 8, 60, false)`,
        [USER_ID, seId, set],
      );
    }
  }

  for (const sessionId of BREATHING) {
    await client.query(
      `INSERT INTO breathing_logs (session_id, user_id, pattern_name, breaths, cycles_completed, planned_cycles, seconds, guidance, ended_early)
       VALUES ($1, $2, 'Box Breathing', 20, 5, 5, 80, 'tones', false)`,
      [sessionId, USER_ID],
    );
  }
}

async function readSessions(client: Client): Promise<SessionRow[]> {
  const res = await client.query<SessionRow>(
    "SELECT id::text AS id, local_date::text AS local_date, status::text AS status FROM sessions WHERE user_id = $1 ORDER BY local_date, id",
    [USER_ID],
  );
  return res.rows;
}

async function readChildCounts(client: Client): Promise<Map<string, ChildCounts>> {
  const res = await client.query<ChildCounts>(
    `SELECT s.id::text AS id,
            (SELECT count(*)::int FROM session_exercises se WHERE se.session_id = s.id) AS ex,
            (SELECT count(*)::int FROM session_exercises se JOIN session_sets ss ON ss.session_exercise_id = se.id
              WHERE se.session_id = s.id) AS sets,
            (SELECT count(*)::int FROM breathing_logs bl WHERE bl.session_id = s.id) AS breath
       FROM sessions s WHERE s.user_id = $1`,
    [USER_ID],
  );
  return new Map(res.rows.map((r) => [r.id, r]));
}

async function readTotals(client: Client): Promise<{ ex: number; sets: number; breath: number }> {
  const res = await client.query<{ ex: number; sets: number; breath: number }>(
    `SELECT (SELECT count(*)::int FROM session_exercises WHERE user_id = $1) AS ex,
            (SELECT count(*)::int FROM session_sets WHERE user_id = $1) AS sets,
            (SELECT count(*)::int FROM breathing_logs WHERE user_id = $1) AS breath`,
    [USER_ID],
  );
  const row = res.rows[0];
  if (row === undefined) throw new Error("totals query returned no row");
  return row;
}

function assertCase(spec: CaseSpec, after: SessionRow[], before: Map<string, ChildCounts>, afterCounts: Map<string, ChildCounts>) {
  console.log(`\nCase ${spec.name}`);
  const onDays = after.filter((s) => spec.localDates.includes(s.local_date));
  const planned = onDays.filter((s) => s.status === "planned").map((s) => s.id);
  const byId = new Map(after.map((s) => [s.id, s]));

  check(`${spec.name}: kept planned = ${spec.keptPlanned.join(", ")}`, sameSet(planned, spec.keptPlanned), `got planned [${planned.join(", ")}]`);
  for (const id of spec.skipped) {
    check(`${spec.name}: ${id} skipped`, byId.get(id)?.status === "skipped", `got ${byId.get(id)?.status ?? "deleted"}`);
  }
  for (const id of spec.deleted) {
    check(`${spec.name}: ${id} deleted`, !byId.has(id), `got ${byId.get(id)?.status ?? "deleted"}`);
    const had = before.get(id);
    check(`${spec.name}: ${id} was childless`, had !== undefined && had.ex === 0 && had.sets === 0 && had.breath === 0);
  }
  for (const { id, status } of spec.untouched) {
    check(`${spec.name}: ${id} still ${status}`, byId.get(id)?.status === status, `got ${byId.get(id)?.status ?? "deleted"}`);
  }

  const survivors = [...spec.keptPlanned, ...spec.skipped, ...spec.untouched.map((u) => u.id)];
  const lost = survivors.filter((id) => {
    const b = before.get(id);
    const a = afterCounts.get(id);
    return b === undefined || a === undefined || b.ex !== a.ex || b.sets !== a.sets || b.breath !== a.breath;
  });
  check(`${spec.name}: zero child rows lost`, lost.length === 0, lost.length ? `changed: ${lost.join(", ")}` : "");
}

async function main() {
  if (process.env.REAL_DB !== "1") {
    console.log("⏭️  Skipping real DB test (REAL_DB=1 not set)");
    return;
  }

  console.log("\nUnique planned session migration test\n");

  const migrationSql = readFileSync(MIGRATION_PATH, "utf8");
  const client = new Client({ connectionString: dbUrl });
  const notices: string[] = [];
  client.on("notice", (msg) => {
    notices.push(msg.message ?? "");
  });
  await client.connect();

  try {
    await client.query("BEGIN");
    // Migrations already ran on this DB; drop the index inside the transaction so dups can be seeded.
    await client.query("DROP INDEX IF EXISTS public.sessions_user_date_planned_unique");

    await seed(client);

    const totalsBefore = await readTotals(client);
    const countsBefore = await readChildCounts(client);
    console.log(`Before: session_exercises ${totalsBefore.ex}, session_sets ${totalsBefore.sets}, breathing_logs ${totalsBefore.breath}`);

    notices.length = 0;
    await client.query(migrationSql);
    const firstRunNotices = [...notices];

    const totalsAfter = await readTotals(client);
    const countsAfter = await readChildCounts(client);
    const sessions = await readSessions(client);
    console.log(`After:  session_exercises ${totalsAfter.ex}, session_sets ${totalsAfter.sets}, breathing_logs ${totalsAfter.breath}`);

    console.log("\nZero child rows lost (all cases):");
    check("session_exercises total unchanged", totalsBefore.ex === totalsAfter.ex, `${totalsBefore.ex} -> ${totalsAfter.ex}`);
    check("session_sets total unchanged", totalsBefore.sets === totalsAfter.sets, `${totalsBefore.sets} -> ${totalsAfter.sets}`);
    check("breathing_logs total unchanged", totalsBefore.breath === totalsAfter.breath, `${totalsBefore.breath} -> ${totalsAfter.breath}`);

    console.log("\nNOTICE:");
    const dedupeNotice = firstRunNotices.find((n) => n.startsWith("Dedupe:"));
    const expectedNotice = `Dedupe: deleted ${EXPECTED_DELETED} childless duplicate(s), skipped ${EXPECTED_SKIPPED} data-bearing duplicate(s)`;
    check("dedupe NOTICE reports the counts", dedupeNotice === expectedNotice, `got ${dedupeNotice ?? "none"}`);

    for (const spec of CASES) {
      assertCase(spec, sessions, countsBefore, countsAfter);
    }

    console.log("\nIndex:");
    const idx = await client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'sessions_user_date_planned_unique'",
    );
    check("sessions_user_date_planned_unique exists", idx.rows[0]?.n === 1);

    await client.query("SAVEPOINT dup_insert");
    let dupCode = "none";
    try {
      await client.query(
        `INSERT INTO sessions (user_id, program_id, program_day_id, local_date, status, planned_type, week_in_block, is_deload)
         VALUES ($1, $2, $3, '2026-11-20', 'planned', 'weights', 1, false)`,
        [USER_ID, PROGRAM_ID, PROGRAM_DAY_ID],
      );
    } catch (e: unknown) {
      dupCode = e instanceof Error && "code" in e && typeof e.code === "string" ? e.code : "unknown";
    }
    await client.query("ROLLBACK TO SAVEPOINT dup_insert");
    check("second planned row on a day is rejected with 23505", dupCode === "23505", `got ${dupCode}`);

    console.log("\nIdempotent re-run:");
    notices.length = 0;
    await client.query(migrationSql);
    const rerun = await readSessions(client);
    const rerunCounts = await readChildCounts(client);
    check("re-run emits no dedupe NOTICE", !notices.some((n) => n.startsWith("Dedupe:")), notices.join(" | "));
    check(
      "re-run leaves sessions unchanged",
      rerun.length === sessions.length && rerun.every((r, i) => r.id === sessions[i]?.id && r.status === sessions[i]?.status),
    );
    check(
      "re-run leaves child counts unchanged",
      [...countsAfter].every(([id, c]) => {
        const r = rerunCounts.get(id);
        return r !== undefined && r.ex === c.ex && r.sets === c.sets && r.breath === c.breath;
      }),
    );
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }

  if (failures > 0) {
    console.log(`\n✗ ${failures} check(s) failed`);
    process.exit(1);
  } else {
    console.log("\n✅ All migration checks passed");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
