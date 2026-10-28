/**
 * Real database test for detect- and repair-superseded-ended-blocks.sql
 *
 * Seeds broken state the way main produces it: the REAL rebuild_block RPC called after the
 * block ended, with block_number unchanged (main's rebuild keeps it), so the replacing
 * block is block 1 again. Runs the actual SQL files via psql and verifies with real helpers.
 *
 * Users:
 *   1. canonical broken account (real RPC): repaired, renumbered 1 -> 2, and the NEXT real
 *      rollover (ensureCurrentBlock) produces block 3;
 *   2. legitimate mid-block rebuild (real RPC): never detected, byte-identical after repair;
 *   3. broken account whose replacing block was rebuilt again under migration 20261025000023
 *      (the bot3 probe-023chain shape, inserted directly because 000025 is live): check 1 is
 *      repaired, the active row (week_offset 5, "Week 6 of 4") is LISTED by detect check 2
 *      for manual handling and left as is.
 *   4. broken account whose replacement was then rebuilt mid-block (real RPCs): two
 *      replacing rows, listed once by detect, both renumbered to block 2.
 *   5. prod shape (user 1181f079): 17 rows numbered 1-13, real blocks "Block 12"/"Block 13";
 *      renumbered so the real blocks are 1 and 2, and the next real rollover gives 3.
 *
 * SQL mutants: each mutated repair runs inside BEGIN ... ROLLBACK and must change the
 * resulting state of the test users (or, for the lock mutant, stop waiting on a held
 * program_block:<uid> lock). Nothing a mutant does is committed.
 *
 * CI runs this as the LAST step of database-seed-test: the real repair runs against the
 * whole test database, so any test added after it sees repaired data.
 *
 * Run: REAL_DB=1 npm run test:repair-superseded-blocks-real-db (CI only)
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { execSync, spawn } from "child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Database } from "../src/lib/database.types.js";
import { checkRealDbTest } from "./lib-db-reset-guard.js";
import { cycleWeekFor } from "../src/lib/program/block-range.js";
import { buildDayRecords, computeStreaks } from "../src/lib/progress/streaks.js";
import { progressStartDate } from "../src/lib/progress/progress-start-date.js";
import { ensureCurrentBlock } from "../src/lib/program/rollover.js";

// Skip unless REAL_DB=1
if (process.env.REAL_DB !== "1") {
  console.log("\n⏭️  Skipping real DB tests (REAL_DB=1 not set)");
  console.log("   Set REAL_DB=1 to run these tests against a local Supabase instance\n");
  process.exit(0);
}

// Check guard
const guardResult = checkRealDbTest();
if (!guardResult.allow) {
  console.log(`\n⏭️  Skipping real DB tests: ${guardResult.reason}\n`);
  process.exit(0);
}

console.log(`✓ Guard check passed: ${guardResult.reason}\n`);

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// Convert Supabase URL to postgres connection string (port 54322 for postgres)
const dbUrl = SUPABASE_URL.replace("http://", "postgresql://postgres:postgres@").replace(":54321", ":54322/postgres");

let testsFailed = 0;
function assert(condition: boolean, message: string, detail = "") {
  if (!condition) {
    console.error(`  ❌ FAIL: ${message}${detail ? ` (${detail})` : ""}`);
    testsFailed++;
  } else {
    console.log(`  ✓    ${message}`);
  }
}

async function testDatabaseConnection() {
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error } = await client.from("profiles").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Execute SQL file via psql
 * @param filePath Path to SQL file
 * @param tuplesOnly If true, use -tA flags (tuples only, unaligned) for detection queries
 */
function executeSQLFile(filePath: string, tuplesOnly = false): string {
  try {
    const flags = tuplesOnly ? "-q -tA -v ON_ERROR_STOP=1" : "-q -v ON_ERROR_STOP=1";
    const result = execSync(
      `psql "${dbUrl}" ${flags} -f "${filePath}"`,
      { encoding: "utf-8", stdio: "pipe" }
    );
    return result;
  } catch (error) {
    console.error(`❌ SQL file execution failed: ${filePath}`);
    throw error;
  }
}

async function runTests() {
  console.log("Checking Supabase connection...");
  
  const isAvailable = await testDatabaseConnection();
  
  if (!isAvailable) {
    console.error("\n❌ REAL_DB=1 but Supabase is not available");
    console.error("   Run `supabase start` to enable these tests\n");
    process.exit(1);
  }
  
  console.log("✓ Connected to Supabase\n");

  // Service role client for fixture setup (bypasses RLS)
  const adminClient = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  // Verify service role key
  try {
    const payload = JSON.parse(Buffer.from(SUPABASE_SERVICE_ROLE_KEY.split('.')[1], 'base64').toString());
    if (payload.role !== 'service_role') {
      console.error(`❌ Expected service_role key, got role: ${payload.role}`);
      process.exit(1);
    }
    console.log(`✓ Using service_role key\n`);
  } catch {
    console.error("❌ Failed to decode service role key");
    process.exit(1);
  }

  // Get a test exercise for sessions
  const { data: exerciseRows, error: exerciseError } = await adminClient
    .from("exercises")
    .select("id")
    .eq("is_active", true)
    .limit(1);

  if (exerciseError || !exerciseRows || exerciseRows.length === 0) {
    console.error("❌ Failed to find test exercise:", exerciseError);
    process.exit(1);
  }
  const exerciseId = exerciseRows[0].id;

  type DayType = Database["public"]["Enums"]["day_type"];
  type DetectCheck = "superseded_ended" | "past_week_4" | "block_number_sequence";
  const detectPath = join(process.cwd(), "scripts/sql/detect-superseded-ended-blocks.sql");
  const repairPath = join(process.cwd(), "scripts/sql/repair-superseded-ended-blocks.sql");
  const repairSql = readFileSync(repairPath, "utf-8");
  let duplicateUserRows = 0;
  const scratch = mkdtempSync(join(tmpdir(), "repair-mutants-"));

  /** Block ids per detect check. Each result set has one row per user; column 3 lists that user's block ids. */
  function detect(): Record<DetectCheck, Set<string>> {
    const out: Record<DetectCheck, Set<string>> = {
      superseded_ended: new Set(), past_week_4: new Set(), block_number_sequence: new Set(),
    };
    const perUser: Record<DetectCheck, Set<string>> = {
      superseded_ended: new Set(), past_week_4: new Set(), block_number_sequence: new Set(),
    };
    for (const line of executeSQLFile(detectPath, true).split("\n")) {
      const [check, userId, blockIds] = line.split("|");
      if (!(check in out) || !blockIds) continue;
      if (perUser[check as DetectCheck].has(userId)) duplicateUserRows++;
      perUser[check as DetectCheck].add(userId);
      for (const id of blockIds.split(",")) out[check as DetectCheck].add(id);
    }
    return out;
  }

  // Every seed write must succeed: a swallowed insert error leaves a user unseeded and
  // turns the asserts that follow into misleading failures.
  function must<R extends { error: { message: string } | null }>(res: R, what: string): R {
    if (res.error) {
      console.error(`❌ Seed failed: ${what}:`, res.error);
      throw new Error(`Seed failed: ${what}: ${res.error.message}`);
    }
    return res;
  }

  async function makeUser(tag: string) {
    const email = `test-repair-${tag}-${Date.now()}@example.com`;
    const password = `test-password-${tag}`;
    const { data, error } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) {
      console.error(`❌ Failed to create test user ${tag}:`, error);
      process.exit(1);
    }
    must(await adminClient.from("profiles").upsert({
      id: data.user.id,
      timezone: "America/Los_Angeles",
      onboarding_completed_at: new Date().toISOString(),
      date_of_birth: "1990-01-01",
      goal: "strength",
      level: "intermediate",
      primary_track: "weights",
      days_per_week: 4,
    }), "upsert profiles");
    const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) {
      console.error(`❌ Failed to sign in test user ${tag}:`, signInError);
      process.exit(1);
    }
    return { userId: data.user.id, client };
  }

  const blockRow = (userId: string, startedOn: string, endsOn: string) => ({
    user_id: userId, block_number: 1, split_type: "upper_lower" as const, days_per_week: 4,
    primary_track: "weights" as const, goal: "strength" as const, level: "intermediate" as const,
    started_on: startedOn, ends_on: endsOn, deload_week: 4, week_offset: 0,
  });

  async function seedBlockWithDay(userId: string, startedOn: string, endsOn: string) {
    const blockId = randomUUID();
    const dayId = randomUUID();
    must(await adminClient.from("programs").insert({ id: blockId, ...blockRow(userId, startedOn, endsOn), status: "active" }), "insert programs");
    must(await adminClient.from("program_days").insert({ id: dayId, program_id: blockId, user_id: userId, day_index: 1, day_type: "weights", label: "Upper A" }), "insert program_days");
    must(await adminClient.from("program_day_exercises").insert({
      id: randomUUID(), program_day_id: dayId, user_id: userId, exercise_id: exerciseId,
      order_index: 0, target_sets: 3, target_reps_min: 8, target_reps_max: 12,
    }), "insert program_day_exercises");
    return { blockId, dayId };
  }

  /** rebuild_block exactly as main's rebuild sends it: block_number kept, ends_on = p_today + 27. */
  async function mainRebuild(client: ReturnType<typeof createClient<Database>>, pToday: string, endsOn: string) {
    const payload = {
      id: randomUUID(), block_number: 1, split_type: "upper_lower", days_per_week: 4,
      primary_track: "weights", goal: "strength", level: "intermediate", ends_on: endsOn, deload_week: 4,
      days: [{
        day_index: 1, day_type: "weights", focus: null, label: "Upper A",
        exercises: [{ exercise_id: exerciseId, order_index: 0, target_sets: 3, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90 }],
      }],
    };
    const { error } = await client.rpc("rebuild_block", {
      p_today: pToday,
      p_payload: payload as Database["public"]["Functions"]["rebuild_block"]["Args"]["p_payload"],
    });
    if (error) {
      console.error("❌ rebuild_block RPC failed:", error);
      throw error;
    }
  }

  async function rowsOf(userId: string) {
    const { data } = await adminClient
      .from("programs")
      .select("id, block_number, status, started_on, ends_on, ended_on, week_offset, created_at")
      .eq("user_id", userId)
      .order("started_on")
      .order("created_at");
    return data ?? [];
  }

  console.log("TEST: Repair wrongly superseded blocks (seeded as main produces them)");
  const createdUserIds: string[] = [];
  try {
    // === USER 1: canonical broken account ===
    const u1 = await makeUser("u1");
    createdUserIds.push(u1.userId);
    const { blockId: blockId1, dayId: dayId1 } = await seedBlockWithDay(u1.userId, "2026-09-29", "2026-10-26");

    const sessionId1 = randomUUID();
    must(await adminClient.from("sessions").insert({
      id: sessionId1, user_id: u1.userId, program_id: blockId1, program_day_id: dayId1,
      local_date: "2026-09-30", status: "completed", planned_type: "weights", actual_type: "weights",
      week_in_block: 1, is_deload: false,
    }), "insert sessions");
    const sessionExId = randomUUID();
    must(await adminClient.from("session_exercises").insert({
      id: sessionExId, session_id: sessionId1, user_id: u1.userId, exercise_id: exerciseId, order_index: 0, status: "completed",
    }), "insert session_exercises");
    const setIds = [randomUUID(), randomUUID(), randomUUID()];
    must(await adminClient.from("session_sets").insert([
      { id: setIds[0], session_exercise_id: sessionExId, user_id: u1.userId, set_number: 1, reps: 10, weight_kg: 50 },
      { id: setIds[1], session_exercise_id: sessionExId, user_id: u1.userId, set_number: 2, reps: 9, weight_kg: 50 },
      { id: setIds[2], session_exercise_id: sessionExId, user_id: u1.userId, set_number: 3, reps: 8, weight_kg: 50 },
    ]), "insert session_sets");

    const todayBuggy = "2026-10-27"; // the day after block 1 ended
    await mainRebuild(u1.client, todayBuggy, "2026-11-23");

    const u1Before = await rowsOf(u1.userId);
    const old1Before = u1Before.find((r) => r.id === blockId1);
    const repl1Before = u1Before.find((r) => r.status === "active");
    assert(u1Before.length === 2, "User 1: 2 rows after main's rebuild", `got ${u1Before.length}`);
    assert(old1Before?.status === "superseded", "User 1: ended block is 'superseded' (the bug)", `got ${old1Before?.status}`);
    assert(old1Before?.ended_on === "2026-10-26", "User 1: ended block ended_on = 2026-10-26", `got ${old1Before?.ended_on}`);
    assert(repl1Before?.block_number === 1, "User 1: replacing block is block 1 again (main keeps block_number)", `got ${repl1Before?.block_number}`);
    assert(repl1Before?.week_offset === 4, "User 1: replacing block has week_offset 4 (the bug)", `got ${repl1Before?.week_offset}`);
    const weekBuggy = cycleWeekFor({ started_on: repl1Before!.started_on, week_offset: repl1Before!.week_offset }, todayBuggy);
    assert(weekBuggy === 5, "User 1: Today shows 'Week 5' (the bug)", `got Week ${weekBuggy}`);

    // === USER 2: legitimate mid-block rebuild ===
    const u2 = await makeUser("u2");
    createdUserIds.push(u2.userId);
    const { blockId: blockId2 } = await seedBlockWithDay(u2.userId, "2026-10-01", "2026-10-28");
    await mainRebuild(u2.client, "2026-10-15", "2026-11-11");
    const u2Before = await rowsOf(u2.userId);

    // === USER 3: broken account whose replacement was rebuilt again under 000023 ===
    // 000023's rebuild_block restarted the row on p_today with the offset carried, so the
    // active row starts 11-03 at week_offset 5 ("Week 6 of 4"). Inserted directly: the live
    // 000025 rebuild_block keeps started_on and cannot produce this shape any more.
    const u3 = await makeUser("u3");
    createdUserIds.push(u3.userId);
    const old3 = randomUUID();
    const repl3 = randomUUID();
    const active3 = randomUUID();
    must(await adminClient.from("programs").insert([
      { id: old3, ...blockRow(u3.userId, "2026-09-29", "2026-10-26"), status: "superseded", ended_on: "2026-10-26" },
      { id: repl3, ...blockRow(u3.userId, "2026-10-27", "2026-11-23"), week_offset: 4, status: "superseded", ended_on: "2026-11-02" },
      { id: active3, ...blockRow(u3.userId, "2026-11-03", "2026-11-30"), week_offset: 5, status: "active" },
    ]), "insert programs");

    // === USER 4: broken account, then a mid-block rebuild of the replacement (real RPCs) ===
    // Today's rebuild_block keeps started_on and week_offset mid-block, so both replacing
    // rows match; detect must still list this user once.
    const u4 = await makeUser("u4");
    createdUserIds.push(u4.userId);
    const { blockId: old4 } = await seedBlockWithDay(u4.userId, "2026-09-29", "2026-10-26");
    await mainRebuild(u4.client, "2026-10-27", "2026-11-23");
    await mainRebuild(u4.client, "2026-11-03", "2026-11-30");
    const u4Before = await rowsOf(u4.userId);
    assert(u4Before.length === 3 && u4Before.every((r) => r.block_number === 1), "User 4: 3 rows, all block 1", u4Before.map((r) => `${r.status}#${r.block_number}`).join(","));

    // === USER 5: prod shape (user 1181f079): 17 rows numbered 1-13 ===
    // Older rebuilds consumed numbers: 11 superseded leftovers #1-#11, the real block 1 as
    // #12 (completed), 4 superseded leftovers of the next block as #13 and the real block 2
    // as #13 (active), so Today shows "Block 13". Inserted directly (older code made it).
    // Every row carries an explicit id: supabase-js sends a multi-row insert with
    // ?columns=<union of keys>, so a row without "id" would send id = NULL (not the default).
    const u5 = await makeUser("u5");
    createdUserIds.push(u5.userId);
    const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
    const real5a = randomUUID();
    const real5b = randomUUID();
    must(await adminClient.from("programs").insert([
      ...Array.from({ length: 11 }, (_, i) => ({
        id: randomUUID(), ...blockRow(u5.userId, addDays("2026-08-26", 2 * i), addDays("2026-08-26", 2 * i + 27)),
        block_number: i + 1, status: "superseded" as const, ended_on: addDays("2026-08-26", 2 * i + 1),
      })),
      { id: real5a, ...blockRow(u5.userId, "2026-09-15", "2026-10-12"), block_number: 12, status: "completed" as const, ended_on: "2026-10-12" },
      ...Array.from({ length: 4 }, (_, i) => ({
        id: randomUUID(), ...blockRow(u5.userId, "2026-10-13", "2026-11-09"), block_number: 13, status: "superseded" as const, ended_on: addDays("2026-10-13", i + 1),
      })),
      { id: real5b, ...blockRow(u5.userId, "2026-10-13", "2026-11-09"), block_number: 13, status: "active" as const },
    ]), "insert programs");
    const u5Before = await rowsOf(u5.userId);
    assert(u5Before.length === 17 && Math.max(...u5Before.map((r) => r.block_number)) === 13, "User 5: 17 rows numbered up to 13", `${u5Before.length} rows`);

    const { data: sessionsBefore } = await adminClient.from("sessions").select("id").in("user_id", createdUserIds);
    const { data: setsBefore } = await adminClient.from("session_sets").select("id").in("user_id", createdUserIds);
    const sessionIdsBefore = (sessionsBefore ?? []).map((s) => s.id).sort().join(",");
    const setIdsBefore = (setsBefore ?? []).map((s) => s.id).sort().join(",");

    // --- Detection before repair ---
    console.log("\n  Detection (before repair)");
    const before = detect();
    assert(before.superseded_ended.has(blockId1), "Check 1 finds user 1's wrongly superseded block");
    assert(before.superseded_ended.has(old3), "Check 1 finds user 3's wrongly superseded block");
    assert(!u2Before.some((r) => before.superseded_ended.has(r.id)), "Check 1 skips user 2's legitimate mid-block rebuild");
    assert(before.superseded_ended.has(old4), "Check 1 finds user 4's wrongly superseded block");
    assert(duplicateUserRows === 0, "Detect lists user 4 (two replacing rows) once per check", `${duplicateUserRows} duplicate rows`);
    assert(before.block_number_sequence.has(real5a) && before.block_number_sequence.has(real5b), "Check 3 finds user 5 (real blocks numbered 12, 13)");
    assert(!u2Before.some((r) => before.block_number_sequence.has(r.id)), "Check 3 skips user 2");
    assert(before.past_week_4.has(repl1Before!.id), "Check 2 finds user 1's replacing block (week_offset 4)");
    assert(before.past_week_4.has(active3), "Check 2 finds user 3's active block (week_offset 5)");
    assert(!u2Before.some((r) => before.past_week_4.has(r.id)), "Check 2 skips user 2");

    // --- SQL mutants (each inside BEGIN ... ROLLBACK, never committed) ---
    const ids = createdUserIds.map((u) => `'${u}'`).join(",");
    const digestSql = `SELECT string_agg(concat_ws(',', user_id, block_number, status, ended_on, week_offset), ';' ORDER BY user_id, started_on, created_at, (status = 'superseded') DESC, id) FROM programs WHERE user_id IN (${ids});`;
    const rolledBack = (sql: string, name: string) => {
      // The repair has no BEGIN/COMMIT of its own, so the caller's transaction (this one)
      // decides; ROLLBACK discards everything it did.
      const file = join(scratch, `${name}.sql`);
      writeFileSync(file, `BEGIN;\n${sql}\n${digestSql}\nROLLBACK;\n`);
      return executeSQLFile(file, true).trim().split("\n").pop() ?? "";
    };
    const holdLock = (userId: string, seconds: number) =>
      spawn("psql", [dbUrl, "-q", "-c", `BEGIN; SELECT pg_advisory_xact_lock(hashtext('program_block:' || '${userId}')); SELECT pg_sleep(${seconds}); COMMIT;`], { stdio: "ignore" });
    const waitsForLock = async (sql: string, name: string) => {
      const holder = holdLock(u1.userId, 4);
      const exited = new Promise((resolve) => holder.on("exit", resolve));
      await new Promise((r) => setTimeout(r, 800));
      const t0 = Date.now();
      rolledBack(sql, name);
      const waited = Date.now() - t0;
      await exited;
      return waited >= 2000;
    };

    console.log("\n  SQL mutants of the repair (rolled back)");
    const expected = rolledBack(repairSql, "real");
    assert(await waitsForLock(repairSql, "real-lock"), "Real repair waits for a held program_block:<uid> lock");
    const mutants: Array<[string, RegExp, string]> = [
      ["M1 ended_on > ends_on misses blocks superseded exactly on their end", /(old\.)?ended_on >= (old\.)?ends_on/g, "$1ended_on > $2ends_on"],
      ["M2 no ended_on criterion (legitimate mid-block rebuilds repaired)", /AND (old\.)?ended_on >= (old\.)?ends_on/g, "AND true"],
      ["M3 step 1 skipped", /    status = 'completed',\n    ended_on = rt\.ends_on/, "    ended_on = p.ended_on"],
      ["M4 step 2 skipped", /SET\n    week_offset = 0\n/, "SET\n    week_offset = p.week_offset\n"],
      ["M5 no renumbering", /SET block_number = e\.expected_block_number/, "SET block_number = p.block_number"],
      ["M6 superseded rows consume numbers", /CASE WHEN p\.status <> 'superseded' THEN 1 ELSE 0 END/g, "1"],
      ["M8 only superseded-ended users renumbered", /\n  UNION\n  SELECT user_id FROM misnumbered;/, ";"],
    ];
    let killed = 0;
    for (const [name, pattern, replacement] of mutants) {
      const mutated = repairSql.replace(pattern, replacement);
      if (mutated === repairSql) {
        assert(false, `${name}: mutation applies`);
        continue;
      }
      const ok = rolledBack(mutated, name.split(" ")[0]) !== expected;
      if (ok) killed++;
      assert(ok, `${name}: killed (state differs)`);
    }
    const noLock = repairSql.replace(/PERFORM pg_advisory_xact_lock\(hashtext\('program_block:' \|\| v_user::text\)\);/, "NULL;");
    if (noLock === repairSql) {
      assert(false, "M7 no advisory lock: mutation applies");
    } else {
      const ok = !(await waitsForLock(noLock, "M7"));
      if (ok) killed++;
      assert(ok, "M7 no advisory lock: killed (does not wait for the held lock)");
    }
    console.log(`  ${killed}/${mutants.length + 1} SQL mutants killed`);

    // --- Real repair, twice ---
    console.log("\n  Repair (first run, then second run for idempotency)");
    executeSQLFile(repairPath, false);
    const snapshot = async () => JSON.stringify(await Promise.all(createdUserIds.map((u) => rowsOf(u))));
    const afterFirst = await snapshot();
    executeSQLFile(repairPath, false);
    const afterSecond = await snapshot();
    assert(afterFirst === afterSecond, "Second repair run is a no-op (programs unchanged)");
    const committed = rolledBack("SELECT 1;", "digest-after");
    assert(committed === expected, "Committed repair matches the rolled-back real run");

    // --- Detection after repair ---
    console.log("\n  Detection (after repair)");
    const after = detect();
    assert(duplicateUserRows === 0, "Detect lists each user at most once per check", `${duplicateUserRows} duplicate rows`);
    assert(!after.superseded_ended.has(blockId1) && !after.superseded_ended.has(old3), "Check 1: no repaired block remains");
    assert(!after.past_week_4.has(repl1Before!.id), "Check 2: user 1's replacing block is no longer past week 4");
    assert(after.past_week_4.has(active3), "Check 2: user 3's 000023-chain block is still listed for manual handling");
    const u1u3Ids = [...(await rowsOf(u1.userId)), ...(await rowsOf(u3.userId)), ...(await rowsOf(u4.userId)), ...(await rowsOf(u5.userId))].map((r) => r.id);
    assert(!u1u3Ids.some((id) => after.block_number_sequence.has(id)), "Check 3: repaired users have sequential block numbers");
    assert(!after.block_number_sequence.has(real5a) && !after.block_number_sequence.has(real5b), "Check 3: user 5 no longer listed");

    // --- User 1 after repair ---
    const u1After = await rowsOf(u1.userId);
    const old1 = u1After.find((r) => r.id === blockId1);
    const repl1 = u1After.find((r) => r.id === repl1Before!.id);
    assert(old1?.status === "completed" && old1.ended_on === old1.ends_on, "User 1: ended block is completed with ended_on = ends_on", `got ${old1?.status} ${old1?.ended_on}`);
    assert(old1?.block_number === 1, "User 1: ended block stays block 1", `got ${old1?.block_number}`);
    assert(repl1?.status === "active" && repl1.block_number === 2, "User 1: replacing block is block 2", `got ${repl1?.status} block ${repl1?.block_number}`);
    assert(repl1?.week_offset === 0, "User 1: replacing block week_offset 0", `got ${repl1?.week_offset}`);
    const week1 = cycleWeekFor({ started_on: repl1!.started_on, week_offset: repl1!.week_offset }, todayBuggy);
    assert(week1 === 1, "User 1: Today shows 'Block 2 · Week 1' on its first day", `got Block ${repl1?.block_number} Week ${week1}`);
    const week4 = cycleWeekFor({ started_on: repl1!.started_on, week_offset: repl1!.week_offset }, "2026-11-17");
    assert(week4 === 4, "User 1: 'Week 4' on day 22", `got Week ${week4}`);

    // --- User 3 after repair ---
    const u3After = await rowsOf(u3.userId);
    const byId3 = Object.fromEntries(u3After.map((r) => [r.id, r]));
    assert(byId3[old3]?.status === "completed" && byId3[old3]?.block_number === 1, "User 3: ended block completed, block 1", JSON.stringify(byId3[old3]));
    assert(byId3[repl3]?.status === "superseded" && byId3[repl3]?.week_offset === 0 && byId3[repl3]?.block_number === 2, "User 3: superseded replacement week_offset 0, block 2", JSON.stringify(byId3[repl3]));
    assert(byId3[active3]?.week_offset === 5 && byId3[active3]?.started_on === "2026-11-03" && byId3[active3]?.block_number === 2, "User 3: 000023-chain active block left at week_offset 5 (manual), renumbered block 2", JSON.stringify(byId3[active3]));

    // --- User 4 after repair ---
    const u4After = await rowsOf(u4.userId);
    assert(
      u4After.map((r) => `${r.status}#${r.block_number}/${r.week_offset}`).join(",") === "completed#1/0,superseded#2/0,active#2/0",
      "User 4: ended block #1; both replacing rows block 2 at week_offset 0",
      u4After.map((r) => `${r.status}#${r.block_number}/${r.week_offset}`).join(","),
    );

    // --- User 5 after repair: real blocks 1 and 2; leftovers share their block's number ---
    const u5After = await rowsOf(u5.userId);
    const real5 = u5After.filter((r) => r.status !== "superseded").map((r) => r.block_number).join(",");
    assert(real5 === "1,2", "User 5: real blocks numbered 1,2 by started_on", real5);
    const left5 = u5After.filter((r) => r.status === "superseded");
    assert(
      left5.filter((r) => r.started_on <= "2026-09-15").every((r) => r.block_number === 1)
        && left5.filter((r) => r.started_on === "2026-10-13").every((r) => r.block_number === 2),
      "User 5: superseded leftovers take their real block's number (1 or 2), none above 2",
      left5.map((r) => r.block_number).join(","),
    );

    // --- User 2 untouched ---
    const u2After = await rowsOf(u2.userId);
    assert(JSON.stringify(u2After) === JSON.stringify(u2Before), "User 2: legitimate mid-block rebuild rows byte-identical");
    assert(!u2After.some((r) => r.id === blockId2 && r.status !== "superseded"), "User 2: original block still superseded");

    // --- Progress for user 1 via the real functions ---
    const { data: allPrograms } = await adminClient
      .from("programs").select("id, started_on, ends_on, ended_on, created_at")
      .eq("user_id", u1.userId).neq("status", "superseded").order("started_on").order("created_at");
    const { data: programDays } = await adminClient
      .from("program_days").select("program_id, day_index, day_type").eq("user_id", u1.userId).eq("status", "active");
    const { data: completedSessions } = await adminClient
      .from("sessions").select("local_date, actual_type, status").eq("user_id", u1.userId).eq("status", "completed").order("local_date");
    const dayTypesByProgram: Record<string, Record<number, DayType>> = {};
    for (const d of programDays ?? []) (dayTypesByProgram[d.program_id] ??= {})[d.day_index] = d.day_type;
    const programs = (allPrograms ?? []).map((p) => ({ id: p.id, startedOn: p.started_on, endsOn: p.ends_on, endedOn: p.ended_on }));
    const sessions = (completedSessions ?? []).map((s) => ({ local_date: s.local_date, actual_type: s.actual_type, status: s.status, working_set_count: 3 }));
    const streaks = computeStreaks(buildDayRecords({ programs, dayTypesByProgram, completedSessions: sessions, today: todayBuggy }), todayBuggy);
    assert(streaks.current === 0, "User 1: current streak 0 (broke on a missed day)", `got ${streaks.current}`);
    assert(streaks.longest === 1, "User 1: best streak 1", `got ${streaks.longest}`);
    assert(streaks.totalSessions === 1, "User 1: days trained 1", `got ${streaks.totalSessions}`);
    const startDate = progressStartDate({ programs, completedSessions: sessions });
    assert(startDate === "2026-09-29", "User 1: Progress starts on block 1's start", `got ${startDate}`);

    // --- Sessions and sets untouched ---
    const { data: sessionsAfter } = await adminClient.from("sessions").select("id").in("user_id", createdUserIds);
    const { data: setsAfter } = await adminClient.from("session_sets").select("id").in("user_id", createdUserIds);
    assert((sessionsAfter ?? []).map((s) => s.id).sort().join(",") === sessionIdsBefore, "Session ids unchanged");
    assert((setsAfter ?? []).map((s) => s.id).sort().join(",") === setIdsBefore, "Set ids unchanged");

    // --- The NEXT rollover numbers correctly (real ensureCurrentBlock + rollover_block) ---
    console.log("\n  Next rollover for user 1 (real ensureCurrentBlock)");
    const rolled = await ensureCurrentBlock(u1.client, u1.userId, "2026-11-24");
    assert(rolled.status === "rolled_over", "User 1: the day after block 2 ends rolls over", JSON.stringify(rolled));
    const u1Rolled = await rowsOf(u1.userId);
    const next = u1Rolled.find((r) => r.status === "active");
    assert(u1Rolled.find((r) => r.id === repl1Before!.id)?.status === "completed", "User 1: block 2 completed by the rollover");
    assert(next?.block_number === 3, "User 1: next block is block 3", `got ${next?.block_number}`);
    assert(next?.started_on === "2026-11-24" && next?.week_offset === 0, "User 1: block 3 starts 2026-11-24 at week_offset 0", `got ${next?.started_on} ${next?.week_offset}`);
    assert(u1Rolled.map((r) => r.block_number).join(",") === "1,2,3", "User 1: block numbers 1,2,3 by started_on", u1Rolled.map((r) => r.block_number).join(","));

    console.log("\n  Next rollover for user 5 (real ensureCurrentBlock)");
    const rolled5 = await ensureCurrentBlock(u5.client, u5.userId, "2026-11-10");
    assert(rolled5.status === "rolled_over", "User 5: the day after block 2 ends rolls over", JSON.stringify(rolled5));
    const next5 = (await rowsOf(u5.userId)).find((r) => r.status === "active");
    assert(next5?.block_number === 3, "User 5: next block is block 3 (not 14)", `got ${next5?.block_number}`);
  } finally {
    for (const uid of createdUserIds) {
      await adminClient.auth.admin.deleteUser(uid);
    }
    console.log(`✓ Cleaned up ${createdUserIds.length} test user(s)\n`);
  }

  if (testsFailed === 0) {
    console.log("\n✅ ALL TESTS PASSED");
    process.exit(0);
  } else {
    console.error(`\n❌ ${testsFailed} TESTS FAILED`);
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error("\n❌ Test runner failed:", error);
  process.exit(1);
});
