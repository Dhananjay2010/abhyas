/**
 * Mutant classification: distinguish crashes from kills.
 * 
 * A CRASH is an unhandled exception, stack trace, or silent exit.
 * A KILL is a test that ran and reported a specific failure marker.
 * 
 * Used by test-mutations.ts and test-owner-decision-mutants.ts.
 */

function hasStackTrace(output: string): boolean {
  return (
    /^\s+at\s+/m.test(output) // Stack frame pattern (line starts with whitespace + "at ")
  );
}

function hasSpecificKillMarker(output: string): boolean {
  // Check for line-anchored specific assertion failure markers
  // Line-anchored patterns (start of line after optional whitespace):
  // - "✗ N test(s) failed" — test-knee-safety-matrix
  // - "❌ N test(s) failed" — test-owner-decision-mutants
  // - "Summary: N passed, M failed" (M ≥ 1) — test-knee-swaps, test-swap-mutations, test-swap-context
  // - "✗ FAIL" / "❌ FAIL" — generic test failure markers
  // - "FAILED:" — generic assertion prefix
  // Bare substring "FAIL" anywhere is forbidden (too broad)
  
  const lineAnchored = [
    /^✗\s+\d+\s+test\(s\)\s+failed/m,            // "✗ 15 test(s) failed"
    /^❌\s+\d+\s+test\(s\)\s+failed/m,            // "❌ 3 test(s) failed"
    /^Summary:.*\s+[1-9]\d*\s+failed/m,          // "Summary: 32 passed, 1 failed" (require ≥1 failure)
    /^✗\s+FAIL/m,                                 // "✗ FAIL: ..."
    /^❌\s+FAIL/m,                                 // "❌ FAIL: ..."
    /^FAILED:/m,                                   // "FAILED: assertion"
  ];
  
  return lineAnchored.some((re) => re.test(output));
}

function stripBothNpmHeaders(output: string): string {
  // Remove BOTH npm header lines:
  // 1. "> pkg@version script"
  // 2. "> command"
  return output
    .replace(/^>\s+[^@\n]+@[^\s]+\s+[^\n]+\n/gm, "")  // "> pkg@ver script"
    .replace(/^>\s+[^\n]+\n/gm, "");                   // "> command"
}

export function isCrash(error: unknown): boolean {
  const stdout = typeof error === "object" && error !== null && "stdout" in error && typeof error.stdout === "string" ? error.stdout : "";
  const stderr = typeof error === "object" && error !== null && "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 1;
  const output = stdout + stderr;
  
  // Rule 1: Definite crash indicators take precedence
  // - Stack trace
  if (hasStackTrace(output)) return true;
  
  // - Uncaught exception / node:internal
  if (output.includes("triggerUncaughtException") || output.includes("node:internal")) return true;
  
  // - Empty output after stripping BOTH npm headers (truly silent exit)
  const cleanOutput = stripBothNpmHeaders(output).trim();
  if (status !== 0 && cleanOutput.length === 0) return true;
  
  // Rule 2: Specific kill markers indicate KILLED (not crash)
  if (hasSpecificKillMarker(output)) return false;
  
  // Rule 3: Anything else with non-zero exit = CRASH
  return true;
}

// Self-test: verify crash detection logic
export function selfTestCrashDetection(): void {
  const cases: Array<{ name: string; error: { stdout: string; stderr: string; status: number }; expectCrash: boolean }> = [
    {
      name: "Stack trace even with ✗ FAIL = CRASH",
      error: { stdout: "✗ FAIL: test\n    at Object.<anonymous>\n", stderr: "", status: 1 },
      expectCrash: true,
    },
    {
      name: "Silent exit (only npm headers) = CRASH",
      error: { stdout: "> abhyas@0.1.0 test\n> tsx test.ts\n", stderr: "", status: 1 },
      expectCrash: true,
    },
    {
      name: "Specific marker ✗ FAIL (no stack) = KILLED",
      error: { stdout: "✗ FAIL: assertion failed\n", stderr: "", status: 1 },
      expectCrash: false,
    },
    {
      name: "Specific marker ❌ FAIL = KILLED",
      error: { stdout: "❌ FAIL: check failed\n", stderr: "", status: 1 },
      expectCrash: false,
    },
    {
      name: "Specific marker FAILED: = KILLED",
      error: { stdout: "FAILED: 3 tests\n", stderr: "", status: 1 },
      expectCrash: false,
    },
    {
      name: "test-knee-safety-matrix pattern ✗ N test(s) failed = KILLED",
      error: { stdout: "✗ 15 test(s) failed\n", stderr: "", status: 1 },
      expectCrash: false,
    },
    {
      name: "test-owner-decision-mutants pattern ❌ N test(s) failed = KILLED",
      error: { stdout: "❌ 3 test(s) failed\n", stderr: "", status: 1 },
      expectCrash: false,
    },
    {
      name: "test-knee-swaps pattern Summary: N passed, M failed = KILLED",
      error: { stdout: "Summary: 32 passed, 1 failed\n", stderr: "", status: 1 },
      expectCrash: false,
    },
    {
      name: "Summary with 0 failed despite exit 1 = CRASH",
      error: { stdout: "Summary: 5 passed, 0 failed\n", stderr: "", status: 1 },
      expectCrash: true,
    },
    {
      name: "Bare FAIL without marker = CRASH",
      error: { stdout: "FAIL to load\n", stderr: "", status: 1 },
      expectCrash: true,
    },
    {
      name: "node:internal = CRASH",
      error: { stdout: "", stderr: "node:internal/process\n", status: 1 },
      expectCrash: true,
    },
    {
      name: "Generic error without marker = CRASH",
      error: { stdout: "Error: something went wrong\n", stderr: "", status: 1 },
      expectCrash: true,
    },
  ];
  
  let failures = 0;
  for (const testCase of cases) {
    const result = isCrash(testCase.error);
    if (result !== testCase.expectCrash) {
      console.error(`✗ Self-test failed: ${testCase.name}`);
      console.error(`  Expected crash=${testCase.expectCrash}, got crash=${result}`);
      failures++;
    }
  }
  
  if (failures > 0) {
    console.error(`\n❌ ${failures} self-test(s) failed`);
    process.exit(1);
  }
}
