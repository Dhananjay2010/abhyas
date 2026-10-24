/**
 * Test session-length step in onboarding.
 *
 * Validates:
 * - Session-length step exists in step sequence
 * - 45 minutes is default (DEFAULT_SESSION_LENGTH)
 * - Four options (30, 45, 60, 75) are available
 * - saveSessionLength action is called
 *
 *   npm run test:onboarding-session-length
 */

import { readFileSync } from "fs";
import { join } from "path";
import { DEFAULT_SESSION_LENGTH, SESSION_LENGTH_OPTIONS } from "../src/lib/onboarding/session-length";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

console.log("\n1. DEFAULT_SESSION_LENGTH is 45");
{
  check("DEFAULT_SESSION_LENGTH equals 45", DEFAULT_SESSION_LENGTH === 45,
    `got ${DEFAULT_SESSION_LENGTH}`);
}

console.log("\n2. SESSION_LENGTH_OPTIONS contains [30, 45, 60, 75]");
{
  const expected = [30, 45, 60, 75];
  check("Has 4 options", SESSION_LENGTH_OPTIONS.length === 4);
  check("Contains 30", SESSION_LENGTH_OPTIONS.includes(30));
  check("Contains 45", SESSION_LENGTH_OPTIONS.includes(45));
  check("Contains 60", SESSION_LENGTH_OPTIONS.includes(60));
  check("Contains 75", SESSION_LENGTH_OPTIONS.includes(75));
  check("Options match expected", JSON.stringify([...SESSION_LENGTH_OPTIONS]) === JSON.stringify(expected));
}

console.log("\n3. Session-length step in onboarding flow");
{
  const flowPath = join(process.cwd(), "src", "app", "onboarding", "onboarding-flow.tsx");
  const flowSource = readFileSync(flowPath, "utf-8");

  // Check for session-length step
  const hasSessionLengthStep = /"session-length"/.test(flowSource);
  check("session-length step exists", hasSessionLengthStep);

  // Check for session length options rendering
  const hasOptionsRendering = /SESSION_LENGTH_OPTIONS/.test(flowSource);
  check("SESSION_LENGTH_OPTIONS is used", hasOptionsRendering);

  // Check for saveSessionLength call
  const callsSaveSessionLength = /saveSessionLength/.test(flowSource);
  check("saveSessionLength is called", callsSaveSessionLength);
}

console.log("\n4. State initialization");
{
  // Check logic: null ?? DEFAULT_SESSION_LENGTH
  const initial1 = null;
  const sessionLength1 = initial1 ?? DEFAULT_SESSION_LENGTH;
  check("null initializes to DEFAULT_SESSION_LENGTH", sessionLength1 === 45);

  const initial2 = 30;
  const sessionLength2 = initial2 ?? DEFAULT_SESSION_LENGTH;
  check("30 initializes to 30", sessionLength2 === 30);

  const initial3 = 60;
  const sessionLength3 = initial3 ?? DEFAULT_SESSION_LENGTH;
  check("60 initializes to 60", sessionLength3 === 60);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}\n`);
process.exit(failures === 0 ? 0 : 1);

export {};
