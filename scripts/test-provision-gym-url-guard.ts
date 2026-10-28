/**
 * Pure unit test for provision-gym.ts URL guard.
 * 
 * Verifies that the CLI script refuses non-localhost URLs unless
 * --i-know-this-is-not-local is passed.
 * 
 * This test does NOT require a real database connection.
 * 
 * Run: npm run test:provision-gym-url-guard
 */

import { spawn } from "child_process";
import { resolve } from "path";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function runScript(
  args: string[],
  env: Record<string, string> = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const scriptPath = "./scripts/provision-gym.ts";
    const child = spawn("tsx", [scriptPath, ...args], {
      env: { ...process.env, ...env },
      cwd: process.cwd(),
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({ code: code || 0, stdout, stderr });
    });
  });
}

async function runTests() {
  console.log("=== Test 1: Localhost URL is allowed ===");
  {
    const { code, stdout, stderr } = await runScript(
      ["Test Gym", "test-gym", "Asia/Kolkata", "owner@example.com"],
      {
        SUPABASE_URL: "http://localhost:54321",
        SUPABASE_SERVICE_ROLE_KEY: "fake-key-for-url-guard-test",
      }
    );

    check("exit code is non-zero (connection will fail)", code !== 0);
    check("does NOT print safety check failed", !stderr.includes("SAFETY CHECK FAILED"));
    check("does NOT refuse localhost", !stdout.includes("SAFETY CHECK FAILED") && !stderr.includes("SAFETY CHECK FAILED"));
  }
  console.log("");

  console.log("=== Test 2: 127.0.0.1 URL is allowed ===");
  {
    const { code, stdout, stderr } = await runScript(
      ["Test Gym", "test-gym", "Asia/Kolkata", "owner@example.com"],
      {
        SUPABASE_URL: "http://127.0.0.1:54321",
        SUPABASE_SERVICE_ROLE_KEY: "fake-key-for-url-guard-test",
      }
    );

    check("exit code is non-zero (connection will fail)", code !== 0);
    check("does NOT print safety check failed", !stderr.includes("SAFETY CHECK FAILED"));
    check("does NOT refuse 127.0.0.1", !stdout.includes("SAFETY CHECK FAILED") && !stderr.includes("SAFETY CHECK FAILED"));
  }
  console.log("");

  console.log("=== Test 3: Remote URL is refused ===");
  {
    const { code, stdout, stderr } = await runScript(
      ["Test Gym", "test-gym", "Asia/Kolkata", "owner@example.com"],
      {
        SUPABASE_URL: "https://abcdefg.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "fake-key-for-url-guard-test",
      }
    );

    check("exit code is 1", code === 1, `got ${code}`);
    check("stderr contains SAFETY CHECK FAILED", stderr.includes("SAFETY CHECK FAILED"));
    check("stderr mentions the URL", stderr.includes("abcdefg.supabase.co"));
    check("stderr mentions override flag", stderr.includes("--i-know-this-is-not-local"));
  }
  console.log("");

  console.log("=== Test 4: Remote URL with override flag prints warning ===");
  {
    const { code, stdout, stderr } = await runScript(
      ["Test Gym", "test-gym", "Asia/Kolkata", "owner@example.com", "--i-know-this-is-not-local"],
      {
        SUPABASE_URL: "https://abcdefg.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "fake-key-for-url-guard-test",
      }
    );

    check("exit code is non-zero (connection will fail)", code !== 0);
    check("stderr contains WARNING", stderr.includes("WARNING"));
    check("stderr mentions non-local database", stderr.includes("NON-LOCAL") || stderr.includes("non-local"));
    check("stderr does NOT refuse", !stderr.includes("SAFETY CHECK FAILED"));
  }
  console.log("");

  console.log("=== Test 5: Missing SUPABASE_SERVICE_ROLE_KEY is rejected ===");
  {
    const { code, stdout, stderr } = await runScript(
      ["Test Gym", "test-gym", "Asia/Kolkata", "owner@example.com"],
      {
        SUPABASE_URL: "http://localhost:54321",
        SUPABASE_SERVICE_ROLE_KEY: "",
      }
    );

    check("exit code is 1", code === 1, `got ${code}`);
    check("stderr mentions SUPABASE_SERVICE_ROLE_KEY", stderr.includes("SUPABASE_SERVICE_ROLE_KEY"));
  }
  console.log("");

  console.log("=== Test 6: Missing required arguments is rejected ===");
  {
    const { code, stdout, stderr } = await runScript(
      ["Test Gym"],
      {
        SUPABASE_URL: "http://localhost:54321",
        SUPABASE_SERVICE_ROLE_KEY: "fake-key",
      }
    );

    check("exit code is 1", code === 1, `got ${code}`);
    check("stderr contains Usage", stderr.includes("Usage"));
  }
  console.log("");

  console.log("=== Test 7: Override flag can be at different positions ===");
  {
    // Override flag at the end
    const { code: code1, stderr: stderr1 } = await runScript(
      ["Test Gym", "test-gym", "Asia/Kolkata", "owner@example.com", "--i-know-this-is-not-local"],
      {
        SUPABASE_URL: "https://xyz.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "fake-key",
      }
    );

    check("override at end: stderr contains WARNING", stderr1.includes("WARNING"));
    check("override at end: NOT refused", !stderr1.includes("SAFETY CHECK FAILED"));

    // Override flag in the middle
    const { code: code2, stderr: stderr2 } = await runScript(
      ["Test Gym", "--i-know-this-is-not-local", "test-gym", "Asia/Kolkata", "owner@example.com"],
      {
        SUPABASE_URL: "https://xyz.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "fake-key",
      }
    );

    check("override in middle: stderr contains WARNING", stderr2.includes("WARNING"));
    check("override in middle: NOT refused", !stderr2.includes("SAFETY CHECK FAILED"));
  }
  console.log("");

  return failures === 0;
}

runTests().then((success) => {
  if (success) {
    console.log("✅ All URL guard tests passed\n");
    process.exit(0);
  } else {
    console.log(`\n❌ ${failures} test(s) failed\n`);
    process.exit(1);
  }
}).catch((err) => {
  console.error("\n❌ Test runner error:", err);
  process.exit(1);
});
