export {};
/**
 * Test: Migration 20261024200000 guards against race conditions
 *
 * Verifies that the migration SQL contains the correct guards:
 * - Advisory lock before existence check and session insert
 * - ON CONFLICT (id) DO NOTHING as backstop
 * - security invoker (not security definer)
 * - No drop function (signature unchanged, grants preserved)
 */

import { readFileSync } from "fs";
import { join } from "path";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20261024200000_breathe_idempotent_retry.sql"
);

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`
  );
}

console.log("\n1. Migration file structure");
let sql: string;
try {
  sql = readFileSync(migrationPath, "utf-8");
  check("migration file exists", true);
} catch {
  check("migration file exists", false, "file not found");
  process.exit(1);
}

// Strip SQL comments before checking (so commented-out code fails the test)
const sqlWithoutComments = sql.replace(/--.*$/gm, "");

console.log("\n2. Advisory lock guards race condition");
const hasAdvisoryLock = /perform\s+pg_advisory_xact_lock\s*\(\s*hashtextextended\s*\(\s*p_log_id\s*::\s*text\s*,\s*0\s*\)\s*\)/i.test(sqlWithoutComments);
check("pg_advisory_xact_lock present", hasAdvisoryLock);

// Find positions of key operations
const advisoryLockPos = sqlWithoutComments.search(/perform\s+pg_advisory_xact_lock/i);
const existenceCheckPos = sqlWithoutComments.search(/select\s+session_id\s+into\s+v_session\s+from\s+breathing_logs\s+where\s+id\s*=\s*p_log_id/i);
const sessionInsertPos = sqlWithoutComments.search(/insert\s+into\s+sessions\s*\(/i);

if (advisoryLockPos > 0 && existenceCheckPos > 0) {
  check(
    "advisory lock before existence check",
    advisoryLockPos < existenceCheckPos,
    `lock at ${advisoryLockPos}, check at ${existenceCheckPos}`
  );
} else {
  check("advisory lock before existence check", false, "positions not found");
}

if (advisoryLockPos > 0 && sessionInsertPos > 0) {
  check(
    "advisory lock before session insert",
    advisoryLockPos < sessionInsertPos,
    `lock at ${advisoryLockPos}, insert at ${sessionInsertPos}`
  );
} else {
  check("advisory lock before session insert", false, "positions not found");
}

console.log("\n3. ON CONFLICT backstop");
const hasOnConflict = /on\s+conflict\s*\(\s*id\s*\)\s+do\s+nothing/i.test(sqlWithoutComments);
check("ON CONFLICT (id) DO NOTHING present", hasOnConflict);

console.log("\n4. Security settings");
const hasSecurityInvoker = /security\s+invoker/i.test(sqlWithoutComments);
check("security invoker present", hasSecurityInvoker);

const hasSecurityDefiner = /security\s+definer/i.test(sqlWithoutComments);
check("security definer NOT present", !hasSecurityDefiner, "should use invoker");

const hasSearchPath = /set\s+search_path\s*=\s*public/i.test(sqlWithoutComments);
check("set search_path = public present", hasSearchPath);

console.log("\n5. No drop function (signature unchanged, grants preserved)");
const hasDropFunction = /drop\s+function/i.test(sqlWithoutComments);
check("drop function NOT present", !hasDropFunction);

console.log("\n6. Grants preserved");
const hasRevoke = /revoke\s+all\s+on\s+function[\s\S]*?from\s+public\s*,\s*anon/i.test(sqlWithoutComments);
check("revoke from public, anon", hasRevoke);

const hasGrant = /grant\s+execute\s+on\s+function[\s\S]*?to\s+authenticated/i.test(sqlWithoutComments);
check("grant to authenticated", hasGrant);

if (failures > 0) {
  console.error(`\n❌ ${failures} check(s) failed\n`);
  process.exit(1);
}

console.log("\nALL CHECKS PASSED\n");
