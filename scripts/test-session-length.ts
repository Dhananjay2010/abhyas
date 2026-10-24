/**
 * Test: Session length validation and persistSessionLength function
 *
 * Verifies:
 * - isAllowedSessionLength accepts only valid integers (30, 45, 60, 75)
 * - Rejects invalid inputs (0, 40, 90, strings, NaN, floats, null)
 * - DEFAULT_SESSION_LENGTH is 45
 * - persistSessionLength validates before database calls
 * - persistSessionLength makes exactly one update call for valid input
 * - persistSessionLength passes through database errors
 * - saveSessionLength in actions.ts calls persistSessionLength
 */

import {
  SESSION_LENGTH_OPTIONS,
  DEFAULT_SESSION_LENGTH,
  isAllowedSessionLength,
  persistSessionLength,
} from "../src/lib/onboarding/session-length";
import { readFile } from "fs/promises";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. Constants are defined correctly");
{
  check("SESSION_LENGTH_OPTIONS is defined", Array.isArray(SESSION_LENGTH_OPTIONS));
  check("SESSION_LENGTH_OPTIONS has 4 values", SESSION_LENGTH_OPTIONS.length === 4);
  check("SESSION_LENGTH_OPTIONS contains 30", SESSION_LENGTH_OPTIONS.includes(30));
  check("SESSION_LENGTH_OPTIONS contains 45", SESSION_LENGTH_OPTIONS.includes(45));
  check("SESSION_LENGTH_OPTIONS contains 60", SESSION_LENGTH_OPTIONS.includes(60));
  check("SESSION_LENGTH_OPTIONS contains 75", SESSION_LENGTH_OPTIONS.includes(75));
  check("DEFAULT_SESSION_LENGTH is 45", DEFAULT_SESSION_LENGTH === 45);
}

console.log("\n2. isAllowedSessionLength accepts valid integers");
{
  check("accepts 30", isAllowedSessionLength(30));
  check("accepts 45", isAllowedSessionLength(45));
  check("accepts 60", isAllowedSessionLength(60));
  check("accepts 75", isAllowedSessionLength(75));
}

console.log("\n3. isAllowedSessionLength rejects invalid inputs");
{
  check("rejects 0", !isAllowedSessionLength(0));
  check("rejects 40", !isAllowedSessionLength(40));
  check("rejects 90", !isAllowedSessionLength(90));
  check('rejects "45" (string)', !isAllowedSessionLength("45"));
  check("rejects NaN", !isAllowedSessionLength(NaN));
  check("rejects 45.5 (float)", !isAllowedSessionLength(45.5));
  check("rejects null", !isAllowedSessionLength(null));
  check("rejects undefined", !isAllowedSessionLength(undefined));
  check("rejects negative -45", !isAllowedSessionLength(-45));
  check("rejects large number 1000", !isAllowedSessionLength(1000));
}

console.log("\n4. persistSessionLength with recording mock client");
{
  type Call = {
    table: string;
    data: { preferred_session_minutes: number };
    column: string;
    id: string;
  };

  const calls: Call[] = [];

  function createMockClient(errorMessage: string | null = null) {
    return {
      from: (table: "profiles") => ({
        update: (data: { preferred_session_minutes: number }) => ({
          eq: (column: "id", id: string) => {
            calls.push({ table, data, column, id });
            return Promise.resolve({ error: errorMessage ? { message: errorMessage } : null });
          },
        }),
      }),
    };
  }

  async function testInvalidInput(input: unknown, label: string) {
    calls.length = 0;
    const client = createMockClient();
    const result = await persistSessionLength(client, "u1", input);
    check(`${label}: zero client calls`, calls.length === 0, `got ${calls.length} calls`);
    check(
      `${label}: exact error string`,
      !result.ok && result.error === "Pick 30, 45, 60 or 75 minutes.",
      result.ok ? "result was ok" : `got error: ${result.error}`
    );
  }

  async function testValidInput() {
    calls.length = 0;
    const client = createMockClient();
    const result = await persistSessionLength(client, "u1", 45);
    check("valid input (45): exactly one client call", calls.length === 1, `got ${calls.length} calls`);
    if (calls.length === 1) {
      check(
        "valid input (45): update data",
        calls[0].data.preferred_session_minutes === 45,
        `got ${calls[0].data.preferred_session_minutes}`
      );
      check("valid input (45): table is profiles", calls[0].table === "profiles");
      check("valid input (45): eq column is id", calls[0].column === "id");
      check("valid input (45): eq id is u1", calls[0].id === "u1");
    }
    check("valid input (45): result is ok", result.ok, JSON.stringify(result));
  }

  async function testDatabaseError() {
    calls.length = 0;
    const client = createMockClient("boom");
    const result = await persistSessionLength(client, "u1", 45);
    check("database error: client was called", calls.length === 1, `got ${calls.length} calls`);
    check("database error: result not ok", !result.ok);
    if (!result.ok) {
      check("database error: error is boom", result.error === "boom", `got error: ${result.error}`);
    }
  }

  async function runTests() {
    await testInvalidInput(40, "invalid input (40)");
    await testInvalidInput("45", 'invalid input ("45")');
    await testInvalidInput(NaN, "invalid input (NaN)");
    await testInvalidInput(45.5, "invalid input (45.5)");
    await testValidInput();
    await testDatabaseError();
  }

  runTests();
}

console.log("\n5. Source check: saveSessionLength calls persistSessionLength");
{
  async function checkSourceFile() {
    try {
      const source = await readFile("src/app/onboarding/actions.ts", "utf-8");
      const hasPersistCall = source.includes("persistSessionLength(");
      check("actions.ts imports persistSessionLength", source.includes("persistSessionLength"));
      check("saveSessionLength calls persistSessionLength", hasPersistCall);
    } catch (error) {
      check(
        "source check failed",
        false,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  checkSourceFile();
}

setTimeout(() => {
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}, 100);
