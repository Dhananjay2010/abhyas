/**
 * Unit tests for database reset guard.
 * 
 * Tests all refuse/allow cases without actually resetting any databases.
 * Pure check-only tests - does not invoke supabase, psql, or connect to any DB.
 */

import { checkDbResetAllowed, parseSupabaseUrl, parseProjectId } from "./lib/db-reset-guard";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
}

function runTests() {
  console.log("🧪 Testing database reset guard\n");

  // Save original env
  const originalCI = process.env.CI;
  const originalAllowReset = process.env.ALLOW_DB_RESET;

  try {
    // TEST: Default run (REAL_DB unset) skips
    console.log("TEST: Default run (REAL_DB unset) refuses");
    delete process.env.CI;
    delete process.env.ALLOW_DB_RESET;
    const defaultResult = checkDbResetAllowed(undefined, "http://192.168.1.10:9999", 'project_id = "Custom"');
    check("REAL_DB unset refuses", !defaultResult.allowed);
    check("Reason mentions REAL_DB", defaultResult.reason.includes("REAL_DB"));
    check("Reason says NO-OP by default", defaultResult.reason.includes("NO-OP by default"));
    console.log();

    // TEST: parseSupabaseUrl
    console.log("TEST: parseSupabaseUrl parsing");
    check("Valid URL with port", parseSupabaseUrl("http://192.168.1.10:54322")?.port === "54322");
    check("Valid URL with non-standard port", parseSupabaseUrl("http://10.0.0.5:9999")?.host === "10.0.0.5");
    check("URL without port returns null", parseSupabaseUrl("http://localhost") === null);
    check("Invalid URL returns null", parseSupabaseUrl("not-a-url") === null);
    check("Undefined URL returns null", parseSupabaseUrl(undefined) === null);
    console.log();

    // TEST: parseProjectId
    console.log("TEST: parseProjectId parsing");
    const config1 = 'project_id = "MyProject"\nother = "value"';
    check("Extracts project_id from config", parseProjectId(config1) === "MyProject");
    check("Missing project_id returns default", parseProjectId("other = \"value\"") === "Fitness");
    check("Null config returns default", parseProjectId(null) === "Fitness");
    console.log();

    // TEST: CI=true always allows (with REAL_DB=1)
    console.log("TEST: CI=true with REAL_DB=1 allows reset");
    delete process.env.ALLOW_DB_RESET;
    process.env.CI = "true";
    const ciResult = checkDbResetAllowed("1", "http://127.0.0.1:54321", null);
    check("CI=true with REAL_DB=1 allows reset", ciResult.allowed);
    check("CI=true reason mentions CI", ciResult.reason.includes("CI"));
    console.log();

    // TEST: CI=true but REAL_DB unset refuses
    console.log("TEST: CI=true but REAL_DB unset refuses");
    const ciNoRealDbResult = checkDbResetAllowed(undefined, "http://127.0.0.1:54321", null);
    check("CI=true without REAL_DB refuses", !ciNoRealDbResult.allowed);
    console.log();

    // TEST: No CI, no ALLOW_DB_RESET refuses (even with REAL_DB=1)
    console.log("TEST: REAL_DB=1 but no CI, no ALLOW_DB_RESET refuses");
    delete process.env.CI;
    delete process.env.ALLOW_DB_RESET;
    const noFlagsResult = checkDbResetAllowed("1", "http://192.168.1.10:9999", 'project_id = "Custom"');
    check("No flags refuses reset", !noFlagsResult.allowed);
    check("Reason mentions ALLOW_DB_RESET", noFlagsResult.reason.includes("ALLOW_DB_RESET"));
    console.log();

    // TEST: ALLOW_DB_RESET=1 with default host refuses
    console.log("TEST: REAL_DB=1, ALLOW_DB_RESET=1 with default host refuses");
    delete process.env.CI;
    process.env.ALLOW_DB_RESET = "1";
    const defaultHostResult = checkDbResetAllowed("1", "http://127.0.0.1:9999", 'project_id = "Custom"');
    check("Default host refuses", !defaultHostResult.allowed);
    check("Reason mentions default host/port", defaultHostResult.reason.includes("default host/port"));
    console.log();

    // TEST: ALLOW_DB_RESET=1 with localhost refuses
    console.log("TEST: ALLOW_DB_RESET=1 with localhost refuses");
    const localhostResult = checkDbResetAllowed("1", "http://localhost:9999", 'project_id = "Custom"');
    check("localhost refuses", !localhostResult.allowed);
    console.log();

    // TEST: ALLOW_DB_RESET=1 with default port refuses
    console.log("TEST: ALLOW_DB_RESET=1 with default port 54321 refuses");
    const defaultPortResult = checkDbResetAllowed("1", "http://192.168.1.10:54321", 'project_id = "Custom"');
    check("Default port refuses", !defaultPortResult.allowed);
    console.log();

    // TEST: ALLOW_DB_RESET=1 with default project_id refuses
    console.log("TEST: ALLOW_DB_RESET=1 with default project_id refuses");
    const defaultProjectResult = checkDbResetAllowed("1", "http://192.168.1.10:9999", 'project_id = "Fitness"');
    check("Default project_id refuses", !defaultProjectResult.allowed);
    check("Reason mentions default project_id", defaultProjectResult.reason.includes("default project_id"));
    console.log();

    // TEST: ALLOW_DB_RESET=1 with missing project_id (returns default) refuses
    console.log("TEST: ALLOW_DB_RESET=1 with missing project_id refuses");
    const missingProjectResult = checkDbResetAllowed("1", "http://192.168.1.10:9999", null);
    check("Missing project_id refuses", !missingProjectResult.allowed);
    console.log();

    // TEST: SUPABASE_DB_URL on :54333 with SUPABASE_URL still default refuses
    console.log("TEST: Non-default SUPABASE_DB_URL doesn't override SUPABASE_URL check");
    process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@192.168.1.10:54333/postgres";
    const dbUrlOnlyResult = checkDbResetAllowed("1", "http://127.0.0.1:54321", 'project_id = "Custom"');
    check("SUPABASE_DB_URL alone doesn't allow", !dbUrlOnlyResult.allowed);
    delete process.env.SUPABASE_DB_URL;
    console.log();

    // TEST: URL on 127.0.0.1:54322 with no dbname refuses
    console.log("TEST: URL without dbname but wrong host refuses");
    const noDbnameResult = checkDbResetAllowed("1", "http://127.0.0.1:54322", 'project_id = "Custom"');
    check("Default host refuses even with different port from default", !noDbnameResult.allowed);
    console.log();

    // TEST: SUPABASE_PROJECT_ID env alone doesn't override config
    console.log("TEST: SUPABASE_PROJECT_ID env var doesn't override config check");
    process.env.SUPABASE_PROJECT_ID = "EnvProject";
    const envProjectResult = checkDbResetAllowed("1", "http://192.168.1.10:9999", 'project_id = "Fitness"');
    check("Env project_id doesn't override config", !envProjectResult.allowed);
    delete process.env.SUPABASE_PROJECT_ID;
    console.log();

    // TEST: URL with no port refuses
    console.log("TEST: SUPABASE_URL without port refuses");
    const noPortResult = checkDbResetAllowed("1", "http://192.168.1.10", 'project_id = "Custom"');
    check("URL without port refuses", !noPortResult.allowed);
    check("Reason mentions missing port", noPortResult.reason.includes("no port"));
    console.log();

    // TEST: ALLOW_DB_RESET=0 refuses (not "1")
    console.log("TEST: ALLOW_DB_RESET=0 refuses");
    delete process.env.CI;
    process.env.ALLOW_DB_RESET = "0";
    const allowZeroResult = checkDbResetAllowed("1", "http://192.168.1.10:9999", 'project_id = "Custom"');
    check("ALLOW_DB_RESET=0 refuses", !allowZeroResult.allowed);
    console.log();

    // TEST: ALLOW_DB_RESET=yes refuses (not "1")
    console.log("TEST: ALLOW_DB_RESET=yes refuses");
    process.env.ALLOW_DB_RESET = "yes";
    const allowYesResult = checkDbResetAllowed("1", "http://192.168.1.10:9999", 'project_id = "Custom"');
    check("ALLOW_DB_RESET=yes refuses", !allowYesResult.allowed);
    console.log();

    // TEST: ALLOW_DB_RESET=1 with non-default host, port, AND project_id allows
    console.log("TEST: REAL_DB=1, ALLOW_DB_RESET=1 with ALL non-defaults allows");
    process.env.ALLOW_DB_RESET = "1";
    const allowResult = checkDbResetAllowed("1", "http://192.168.1.10:9999", 'project_id = "MyCustomProject"');
    check("Non-default host, port, and project_id allows", allowResult.allowed);
    check("Reason includes all details", 
      allowResult.reason.includes("192.168.1.10:9999") && allowResult.reason.includes("MyCustomProject"));
    console.log();

    console.log("✅ All guard tests passed");
    console.log();

  } finally {
    // Restore original env
    if (originalCI !== undefined) {
      process.env.CI = originalCI;
    } else {
      delete process.env.CI;
    }
    
    if (originalAllowReset !== undefined) {
      process.env.ALLOW_DB_RESET = originalAllowReset;
    } else {
      delete process.env.ALLOW_DB_RESET;
    }
    
    delete process.env.SUPABASE_DB_URL;
    delete process.env.SUPABASE_PROJECT_ID;
  }

  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed\n`);
    process.exit(1);
  }

  console.log("✅ All database reset guard tests passed\n");
}

runTests();
