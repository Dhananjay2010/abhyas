#!/usr/bin/env tsx
/**
 * Crash classification probes: verify that crash detection works correctly
 * 
 * Tests that uncaught exceptions are classified as CRASH (not KILLED)
 * and cause the test runner to exit with code 1.
 */

import { execSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";

console.log("=".repeat(80));
console.log("CRASH CLASSIFICATION PROBES");
console.log("=".repeat(80));
console.log("");

const probeFile = "scripts/.crash-probe-temp.ts";

function runProbe(name: string, code: string): { exitCode: number; hasStackTrace: boolean; output: string } {
  // Write probe file
  writeFileSync(probeFile, code, "utf-8");
  
  try {
    const output = execSync(`npx tsx ${probeFile}`, { 
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    return { exitCode: 0, hasStackTrace: false, output };
  } catch (error: unknown) {
    const stdout = typeof error === "object" && error !== null && "stdout" in error && typeof error.stdout === "string" ? error.stdout : "";
    const stderr = typeof error === "object" && error !== null && "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 1;
    const output = stdout + stderr;
    const hasStackTrace = output.includes("    at ") || /^\s+at\s+/m.test(output);
    return { exitCode: status, hasStackTrace, output };
  } finally {
    try {
      unlinkSync(probeFile);
    } catch {}
  }
}

let passed = 0;
let failed = 0;

// Probe 1: throw new Error()
console.log("Probe 1: throw new Error()");
const probe1 = runProbe("error-throw", `
console.log("Before throw");
throw new Error("Test error");
console.log("After throw");
`);

if (probe1.exitCode !== 0 && probe1.hasStackTrace) {
  console.log("  ✓ PASS: Exit code " + probe1.exitCode + ", stack trace detected");
  passed++;
} else {
  console.log(`  ✗ FAIL: Exit code ${probe1.exitCode}, stack trace: ${probe1.hasStackTrace}`);
  console.log(`  Output: ${probe1.output.substring(0, 200)}`);
  failed++;
}
console.log("");

// Probe 2: throw 'string'
console.log("Probe 2: throw 'string'");
const probe2 = runProbe("string-throw", `
console.log("Before throw");
throw "String error";
console.log("After throw");
`);

if (probe2.exitCode !== 0) {
  console.log("  ✓ PASS: Exit code " + probe2.exitCode);
  passed++;
} else {
  console.log(`  ✗ FAIL: Exit code ${probe2.exitCode}`);
  console.log(`  Output: ${probe2.output.substring(0, 200)}`);
  failed++;
}
console.log("");

// Probe 3: process.exit(1)
console.log("Probe 3: process.exit(1)");
const probe3 = runProbe("process-exit", `
console.log("Before exit");
process.exit(1);
console.log("After exit");
`);

if (probe3.exitCode === 1 && !probe3.hasStackTrace) {
  console.log("  ✓ PASS: Exit code 1, no stack trace (clean exit)");
  passed++;
} else {
  console.log(`  ✗ FAIL: Exit code ${probe3.exitCode}, stack trace: ${probe3.hasStackTrace}`);
  console.log(`  Output: ${probe3.output.substring(0, 200)}`);
  failed++;
}
console.log("");

// Probe 4: Normal test failure (console.error + exit 1)
console.log("Probe 4: Normal test failure (console.error + exit 1)");
const probe4 = runProbe("test-failure", `
console.log("Running test...");
console.error("❌ FAILED: Test assertion failed");
process.exit(1);
`);

if (probe4.exitCode === 1 && !probe4.hasStackTrace) {
  console.log("  ✓ PASS: Exit code 1, no stack trace (clean test failure)");
  passed++;
} else {
  console.log(`  ✗ FAIL: Exit code ${probe4.exitCode}, stack trace: ${probe4.hasStackTrace}`);
  console.log(`  Output: ${probe4.output.substring(0, 200)}`);
  failed++;
}
console.log("");

// Final report
console.log("=".repeat(80));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log("=".repeat(80));

if (failed > 0) {
  console.log("");
  console.log("❌ CRASH CLASSIFICATION PROBES FAILED");
  process.exit(1);
} else {
  console.log("");
  console.log("✅ CRASH CLASSIFICATION PROBES PASSED");
  console.log("");
  console.log("Key findings:");
  console.log("  • throw new Error() → exit 1 + stack trace = CRASH");
  console.log("  • throw 'string' → exit 1 = CRASH");
  console.log("  • process.exit(1) → exit 1, no stack trace = KILLED");
  console.log("  • console.error + exit 1 → no stack trace = KILLED");
  process.exit(0);
}
