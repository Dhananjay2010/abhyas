/**
 * Test: Session length validation and persistSessionLength function
 *
 * Verifies:
 * - isAllowedSessionLength accepts only valid integers (30, 45, 60, 75)
 * - Rejects invalid inputs (0, 40, 90, strings, NaN, floats, null)
 * - DEFAULT_SESSION_LENGTH is 45
 * - persistSessionLength validates before calling writer
 * - persistSessionLength calls writer exactly once for valid input
 * - persistSessionLength passes through writer errors
 * - saveSessionLength in actions.ts calls persistSessionLength
 * - saveSessionLength has no type bypasses (@ts-expect-error, @ts-ignore, as)
 */

import {
  SESSION_LENGTH_OPTIONS,
  DEFAULT_SESSION_LENGTH,
  isAllowedSessionLength,
  persistSessionLength,
  type SessionLengthWriter,
} from "../src/lib/onboarding/session-length";
import { readFile } from "fs/promises";

let failures = 0;
let checksRan = 0;

function check(label: string, ok: boolean, detail = "") {
  checksRan++;
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

console.log("\n4. persistSessionLength with recording writer");

async function runTests() {
  type Call = 30 | 45 | 60 | 75;
  const calls: Call[] = [];

  function createWriter(errorMessage: string | null = null): SessionLengthWriter {
    return (minutes: 30 | 45 | 60 | 75) => {
      calls.push(minutes);
      return Promise.resolve({ error: errorMessage ? { message: errorMessage } : null });
    };
  }

  async function testInvalidInput(input: unknown, label: string) {
    calls.length = 0;
    const writer = createWriter();
    const result = await persistSessionLength(writer, input);
    check(`${label}: zero writer calls`, calls.length === 0, `got ${calls.length} calls`);
    check(
      `${label}: exact error string`,
      !result.ok && result.error === "Pick 30, 45, 60 or 75 minutes.",
      result.ok ? "result was ok" : `got error: ${result.error}`
    );
  }

  async function testValidInput() {
    calls.length = 0;
    const writer = createWriter();
    const result = await persistSessionLength(writer, 45);
    check("valid input (45): exactly one writer call", calls.length === 1, `got ${calls.length} calls`);
    if (calls.length === 1) {
      check("valid input (45): writer received 45", calls[0] === 45, `got ${calls[0]}`);
    }
    check("valid input (45): result is ok", result.ok, JSON.stringify(result));
  }

  async function testWriterError() {
    calls.length = 0;
    const writer = createWriter("boom");
    const result = await persistSessionLength(writer, 45);
    check("writer error: writer was called", calls.length === 1, `got ${calls.length} calls`);
    if (calls.length === 1) {
      check("writer error: writer called with 45", calls[0] === 45, `got ${calls[0]}`);
    }
    check("writer error: result not ok", !result.ok);
    if (!result.ok) {
      check("writer error: error is boom", result.error === "boom", `got error: ${result.error}`);
    }
  }

  await testInvalidInput(40, "invalid input (40)");
  await testInvalidInput("45", 'invalid input ("45")');
  await testInvalidInput(NaN, "invalid input (NaN)");
  await testInvalidInput(45.5, "invalid input (45.5)");
  await testValidInput();
  await testWriterError();
}

console.log("\n5. Source check: saveSessionLength calls persistSessionLength and has no type bypasses");

async function checkSourceFile() {
  try {
    const source = await readFile("src/app/onboarding/actions.ts", "utf-8");
    
    check("actions.ts imports persistSessionLength", source.includes("persistSessionLength"));
    
    const saveSessionLengthMatch = source.match(
      /export async function saveSessionLength[\s\S]*?\n\}/
    );
    
    if (saveSessionLengthMatch) {
      const saveSessionLengthCode = saveSessionLengthMatch[0];
      check("saveSessionLength calls persistSessionLength", 
        saveSessionLengthCode.includes("persistSessionLength("));
      check("saveSessionLength has no @ts-expect-error", 
        !saveSessionLengthCode.includes("@ts-expect-error"));
      check("saveSessionLength has no @ts-ignore", 
        !saveSessionLengthCode.includes("@ts-ignore"));
      check("saveSessionLength has no ' as ' cast", 
        !saveSessionLengthCode.includes(" as "));
    } else {
      check("found saveSessionLength function", false, "could not extract function");
    }
  } catch (error) {
    check(
      "source check failed",
      false,
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function main() {
  await runTests();
  await checkSourceFile();

  const expectedChecks = 41;
  check(`ran expected number of checks (${expectedChecks})`, checksRan === expectedChecks, 
    `ran ${checksRan} checks`);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nTest script error:", e);
  process.exit(1);
});
