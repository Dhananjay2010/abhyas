#!/usr/bin/env bash
set -euo pipefail

# Pure tests for db-reset-guard logic (bash and TypeScript)
# NO database operations, NO exec, NO network calls
# Just test the pure decision functions

echo "=== Pure DB Reset Guard Tests ==="
echo

FAILURES=0

check() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  
  if [ "$expected" = "$actual" ]; then
    echo "  ✓ $label"
  else
    echo "  ✗ $label (expected: $expected, got: $actual)"
    FAILURES=$((FAILURES + 1))
  fi
}

# Source the bash guard
source "$(dirname "$0")/lib-db-reset-guard.sh"

# Create a temp directory with test config files
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# Default config (Fitness, port 54322)
cat > "$TMPDIR/default-config.toml" << 'EOF'
project_id = "Fitness"

[db]
port = 54322
EOF

# Non-default config (TestGym, port 54333)
cat > "$TMPDIR/custom-config.toml" << 'EOF'
project_id = "TestGym"

[db]
port = 54333

[api]
port = 54334
EOF

# Config with single-quoted project_id
cat > "$TMPDIR/single-quote-config.toml" << 'EOF'
project_id = 'TestGym'

[db]
port = 54333

[api]
port = 54334
EOF

# Config with comment after project_id
cat > "$TMPDIR/comment-config.toml" << 'EOF'
project_id = "TestGym" # "Fitness"

[db]
port = 54333

[api]
port = 54334
EOF

# Config with env() in project_id
cat > "$TMPDIR/env-config.toml" << 'EOF'
project_id = "env(PROJ)"

[db]
port = 54333

[api]
port = 54334
EOF

echo "TEST: Bash guard - CI=true always allows"
CI=true ALLOW_DB_RESET=0 SUPABASE_DB_URL="" SUPABASE_PROJECT_ID="Fitness"
if check_db_reset_guard_bash check "$TMPDIR/default-config.toml"; then
  check "CI=true allows (ignores config)" "0" "0"
else
  check "CI=true allows (ignores config)" "0" "1"
fi
unset CI
echo

echo "TEST: Bash guard - Missing ALLOW_DB_RESET refuses"
unset ALLOW_DB_RESET
unset SUPABASE_PROJECT_ID
unset SUPABASE_DB_PORT
SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres"
if check_db_reset_guard_bash check "$TMPDIR/custom-config.toml"; then
  check "No ALLOW_DB_RESET refuses" "1" "0"
else
  check "No ALLOW_DB_RESET refuses" "1" "1"
fi
echo

echo "TEST: Bash guard - SUPABASE_PROJECT_ID env var refuses"
ALLOW_DB_RESET="1" SUPABASE_PROJECT_ID="TestGym" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres"
unset SUPABASE_DB_PORT
if check_db_reset_guard_bash check "$TMPDIR/custom-config.toml"; then
  check "SUPABASE_PROJECT_ID env var refuses" "1" "0"
else
  check "SUPABASE_PROJECT_ID env var refuses" "1" "1"
fi
unset SUPABASE_PROJECT_ID
echo

echo "TEST: Bash guard - SUPABASE_DB_PORT env var refuses"
ALLOW_DB_RESET="1" SUPABASE_DB_PORT="54333" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres"
if check_db_reset_guard_bash check "$TMPDIR/custom-config.toml"; then
  check "SUPABASE_DB_PORT env var refuses" "1" "0"
else
  check "SUPABASE_DB_PORT env var refuses" "1" "1"
fi
unset SUPABASE_DB_PORT
echo

echo "TEST: Bash guard - PGHOST env var refuses"
ALLOW_DB_RESET="1" PGHOST="localhost" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres"
if check_db_reset_guard_bash check "$TMPDIR/custom-config.toml"; then
  check "PGHOST env var refuses" "1" "0"
else
  check "PGHOST env var refuses" "1" "1"
fi
unset PGHOST
echo

echo "TEST: Bash guard - PGPORT env var refuses"
ALLOW_DB_RESET="1" PGPORT="54333" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres"
if check_db_reset_guard_bash check "$TMPDIR/custom-config.toml"; then
  check "PGPORT env var refuses" "1" "0"
else
  check "PGPORT env var refuses" "1" "1"
fi
unset PGPORT
echo

echo "TEST: Bash guard - PGSERVICE env var refuses"
ALLOW_DB_RESET="1" PGSERVICE="myservice" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres"
if check_db_reset_guard_bash check "$TMPDIR/custom-config.toml"; then
  check "PGSERVICE env var refuses" "1" "0"
else
  check "PGSERVICE env var refuses" "1" "1"
fi
unset PGSERVICE
echo

echo "TEST: Bash guard - PGHOSTADDR env var refuses"
ALLOW_DB_RESET="1" PGHOSTADDR="127.0.0.1" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres"
if check_db_reset_guard_bash check "$TMPDIR/custom-config.toml"; then
  check "PGHOSTADDR env var refuses" "1" "0"
else
  check "PGHOSTADDR env var refuses" "1" "1"
fi
unset PGHOSTADDR
echo

echo "TEST: Bash guard - Default port in config refuses"
ALLOW_DB_RESET="1" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54322/postgres"
if check_db_reset_guard_bash check "$TMPDIR/default-config.toml"; then
  check "Default port refuses (config.toml port=54322)" "1" "0"
else
  check "Default port refuses (config.toml port=54322)" "1" "1"
fi
echo

echo "TEST: Bash guard - Default project_id in config refuses"
ALLOW_DB_RESET="1" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres"
cat > "$TMPDIR/test1-config.toml" << 'EOF'
project_id = "Fitness"

[db]
port = 54333
EOF
if check_db_reset_guard_bash check "$TMPDIR/test1-config.toml"; then
  check "Default project_id refuses (config.toml project_id=Fitness)" "1" "0"
else
  check "Default project_id refuses (config.toml project_id=Fitness)" "1" "1"
fi
echo

echo "TEST: Bash guard - SUPABASE_DB_URL with ?port= query param refuses"
ALLOW_DB_RESET="1" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres?port=54322"
if check_db_reset_guard_bash check "$TMPDIR/custom-config.toml"; then
  check "URL with ?port= refuses" "1" "0"
else
  check "URL with ?port= refuses" "1" "1"
fi
echo

echo "TEST: Bash guard - SUPABASE_DB_URL with ?host= query param refuses"
ALLOW_DB_RESET="1" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres?host=other"
if check_db_reset_guard_bash check "$TMPDIR/custom-config.toml"; then
  check "URL with ?host= refuses" "1" "0"
else
  check "URL with ?host= refuses" "1" "1"
fi
echo

echo "TEST: Bash guard - SUPABASE_DB_URL with &hostaddr= query param refuses"
ALLOW_DB_RESET="1" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres?foo=bar&hostaddr=1.2.3.4"
if check_db_reset_guard_bash check "$TMPDIR/custom-config.toml"; then
  check "URL with &hostaddr= refuses" "1" "0"
else
  check "URL with &hostaddr= refuses" "1" "1"
fi
echo

echo "TEST: Bash guard - SUPABASE_DB_URL with ?service= query param refuses"
ALLOW_DB_RESET="1" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres?service=mydb"
if check_db_reset_guard_bash check "$TMPDIR/custom-config.toml"; then
  check "URL with ?service= refuses" "1" "0"
else
  check "URL with ?service= refuses" "1" "1"
fi
echo

echo "TEST: Bash guard - Multi-host SUPABASE_DB_URL refuses"
ALLOW_DB_RESET="1" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333,other:5432/postgres"
if check_db_reset_guard_bash check "$TMPDIR/custom-config.toml"; then
  check "Multi-host URL refuses" "1" "0"
else
  check "Multi-host URL refuses" "1" "1"
fi
echo

echo "TEST: Bash guard - [::1]:54322 refuses (IPv6 loopback on default port)"
ALLOW_DB_RESET="1"
cat > "$TMPDIR/test-ipv6.toml" << 'EOF'
project_id = "TestGym"

[db]
port = 54322
EOF
SUPABASE_DB_URL="postgresql://postgres:postgres@[::1]:54322/postgres"
if check_db_reset_guard_bash check "$TMPDIR/test-ipv6.toml"; then
  check "[::1]:54322 refuses (default port)" "1" "0"
else
  check "[::1]:54322 refuses (default port)" "1" "1"
fi
echo

echo "TEST: Bash guard - 127.0.0.2:54322 refuses (loopback subnet on default port)"
SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.2:54322/postgres"
if check_db_reset_guard_bash check "$TMPDIR/test-ipv6.toml"; then
  check "127.0.0.2:54322 refuses (default port)" "1" "0"
else
  check "127.0.0.2:54322 refuses (default port)" "1" "1"
fi
echo

echo "TEST: Bash guard - 0.0.0.0:54322 refuses (unspecified addr on default port)"
SUPABASE_DB_URL="postgresql://postgres:postgres@0.0.0.0:54322/postgres"
if check_db_reset_guard_bash check "$TMPDIR/test-ipv6.toml"; then
  check "0.0.0.0:54322 refuses (default port)" "1" "0"
else
  check "0.0.0.0:54322 refuses (default port)" "1" "1"
fi
echo

echo "TEST: Bash guard - Single-quoted project_id parsed correctly"
ALLOW_DB_RESET="1" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" SUPABASE_URL="http://localhost:54334"
if check_db_reset_guard_bash check "$TMPDIR/single-quote-config.toml"; then
  check "Single-quoted project_id allows" "0" "0"
else
  check "Single-quoted project_id allows" "0" "1"
fi
echo

echo "TEST: Bash guard - Comment after project_id parsed correctly"
ALLOW_DB_RESET="1" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" SUPABASE_URL="http://localhost:54334"
if check_db_reset_guard_bash check "$TMPDIR/comment-config.toml"; then
  check "Comment after project_id allows" "0" "0"
else
  check "Comment after project_id allows" "0" "1"
fi
echo

echo "TEST: Bash guard - env() in project_id refuses"
ALLOW_DB_RESET="1" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres"
if check_db_reset_guard_bash check "$TMPDIR/env-config.toml"; then
  check "env() in project_id refuses" "1" "0"
else
  check "env() in project_id refuses" "1" "1"
fi
echo

echo "TEST: Bash guard - Non-default config with matching URL allows"
ALLOW_DB_RESET="1" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" SUPABASE_URL="http://localhost:54334"
if check_db_reset_guard_bash check "$TMPDIR/custom-config.toml"; then
  check "Non-default allows (config port=54333, URL port=54333)" "0" "0"
else
  check "Non-default allows (config port=54333, URL port=54333)" "0" "1"
fi
echo

echo "TEST: Bash guard - Missing config file refuses"
ALLOW_DB_RESET="1" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres"
if check_db_reset_guard_bash check "$TMPDIR/nonexistent.toml"; then
  check "Missing config file refuses" "1" "0"
else
  check "Missing config file refuses" "1" "1"
fi
echo

echo "TEST: Bash guard - SUPABASE_DB_URL unset refuses (outside CI)"
unset SUPABASE_DB_URL
ALLOW_DB_RESET="1"
if check_db_reset_guard_bash check "$TMPDIR/custom-config.toml"; then
  check "SUPABASE_DB_URL unset refuses (even with non-default config)" "1" "0"
else
  check "SUPABASE_DB_URL unset refuses (even with non-default config)" "1" "1"
fi
echo

echo "TEST: Bash guard - Config with [db.pooler] port doesn't pick wrong port"
cat > "$TMPDIR/pooler-config.toml" << 'EOF'
project_id = "TestGym"

[db]
port = 54333

[db.pooler]
port = 54329

[api]
port = 54334
EOF
ALLOW_DB_RESET="1" SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" SUPABASE_URL="http://localhost:54334"
if check_db_reset_guard_bash check "$TMPDIR/pooler-config.toml"; then
  check "Pooler port ignored, [db] port used (54333)" "0" "0"
else
  check "Pooler port ignored, [db] port used (54333)" "0" "1"
fi
echo

echo "TEST: TypeScript guard - Run via tsx"
# Test the TypeScript guard
npx tsx << 'TSTEST'
import { checkDbResetGuard, checkRealDbTest } from "./scripts/lib-db-reset-guard";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

let failures = 0;

function check(label: string, expected: boolean, actual: boolean) {
  if (expected === actual) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label} (expected: ${expected}, got: ${actual})`);
    failures++;
  }
}

// Create temp configs
const tmpDir = mkdtempSync("/tmp/tstest-");
const customConfig = join(tmpDir, "custom.toml");
const defaultConfig = join(tmpDir, "default.toml");
const singleQuoteConfig = join(tmpDir, "single-quote.toml");
const commentConfig = join(tmpDir, "comment.toml");
const envConfig = join(tmpDir, "env.toml");

writeFileSync(customConfig, 'project_id = "TestGym"\n\n[db]\nport = 54333\n\n[api]\nport = 54334\n');
writeFileSync(defaultConfig, 'project_id = "Fitness"\n\n[db]\nport = 54322\n\n[api]\nport = 54321\n');
writeFileSync(singleQuoteConfig, "project_id = 'TestGym'\n\n[db]\nport = 54333\n\n[api]\nport = 54334\n");
writeFileSync(commentConfig, 'project_id = "TestGym" # "Fitness"\n\n[db]\nport = 54333\n\n[api]\nport = 54334\n');
writeFileSync(envConfig, 'project_id = "env(PROJ)"\n\n[db]\nport = 54333\n\n[api]\nport = 54334\n');

try {
  console.log("TypeScript guard - CI=true allows");
  process.env.CI = "true";
  process.env.ALLOW_DB_RESET = "0";
  delete process.env.SUPABASE_PROJECT_ID;
  delete process.env.SUPABASE_DB_PORT;
  delete process.env.PGHOST;
  delete process.env.PGPORT;
  delete process.env.PGSERVICE;
  delete process.env.PGHOSTADDR;
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54322/postgres";
  check("CI=true allows", true, checkDbResetGuard(defaultConfig).allow);
  console.log();

  console.log("TypeScript guard - Missing ALLOW_DB_RESET refuses");
  delete process.env.CI;
  delete process.env.ALLOW_DB_RESET;
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres";
  check("No ALLOW_DB_RESET refuses", false, checkDbResetGuard(customConfig).allow);
  console.log();

  console.log("TypeScript guard - SUPABASE_PROJECT_ID env var refuses");
  process.env.ALLOW_DB_RESET = "1";
  process.env.SUPABASE_PROJECT_ID = "TestGym";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres";
  check("SUPABASE_PROJECT_ID env var refuses", false, checkDbResetGuard(customConfig).allow);
  delete process.env.SUPABASE_PROJECT_ID;
  console.log();

  console.log("TypeScript guard - SUPABASE_DB_PORT env var refuses");
  process.env.ALLOW_DB_RESET = "1";
  process.env.SUPABASE_DB_PORT = "54333";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres";
  check("SUPABASE_DB_PORT env var refuses", false, checkDbResetGuard(customConfig).allow);
  delete process.env.SUPABASE_DB_PORT;
  console.log();

  console.log("TypeScript guard - PGHOST env var refuses");
  process.env.ALLOW_DB_RESET = "1";
  process.env.PGHOST = "localhost";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres";
  check("PGHOST env var refuses", false, checkDbResetGuard(customConfig).allow);
  delete process.env.PGHOST;
  console.log();

  console.log("TypeScript guard - PGPORT env var refuses");
  process.env.ALLOW_DB_RESET = "1";
  process.env.PGPORT = "54333";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres";
  check("PGPORT env var refuses", false, checkDbResetGuard(customConfig).allow);
  delete process.env.PGPORT;
  console.log();

  console.log("TypeScript guard - PGSERVICE env var refuses");
  process.env.ALLOW_DB_RESET = "1";
  process.env.PGSERVICE = "myservice";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres";
  check("PGSERVICE env var refuses", false, checkDbResetGuard(customConfig).allow);
  delete process.env.PGSERVICE;
  console.log();

  console.log("TypeScript guard - PGHOSTADDR env var refuses");
  process.env.ALLOW_DB_RESET = "1";
  process.env.PGHOSTADDR = "127.0.0.1";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres";
  check("PGHOSTADDR env var refuses", false, checkDbResetGuard(customConfig).allow);
  delete process.env.PGHOSTADDR;
  console.log();

  console.log("TypeScript guard - Default host/port refuses (localhost:54322)");
  process.env.ALLOW_DB_RESET = "1";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54322/postgres";
  check("Default localhost:54322 refuses", false, checkDbResetGuard(defaultConfig).allow);
  console.log();

  console.log("TypeScript guard - Default host/port refuses (127.0.0.1:54322)");
  process.env.ALLOW_DB_RESET = "1";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  check("Default 127.0.0.1:54322 refuses", false, checkDbResetGuard(defaultConfig).allow);
  console.log();

  console.log("TypeScript guard - Default project refuses");
  process.env.ALLOW_DB_RESET = "1";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres";
  const defaultProjConfig = join(tmpDir, "default-proj.toml");
  writeFileSync(defaultProjConfig, 'project_id = "Fitness"\n\n[db]\nport = 54333\n');
  check("Default project refuses", false, checkDbResetGuard(defaultProjConfig).allow);
  console.log();

  console.log("TypeScript guard - URL with ?port= query param refuses");
  process.env.ALLOW_DB_RESET = "1";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres?port=54322";
  check("URL with ?port= refuses", false, checkDbResetGuard(customConfig).allow);
  console.log();

  console.log("TypeScript guard - URL with &host= query param refuses");
  process.env.ALLOW_DB_RESET = "1";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres?foo=bar&host=other";
  check("URL with &host= refuses", false, checkDbResetGuard(customConfig).allow);
  console.log();

  console.log("TypeScript guard - URL with ?hostaddr= query param refuses");
  process.env.ALLOW_DB_RESET = "1";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres?hostaddr=1.2.3.4";
  check("URL with ?hostaddr= refuses", false, checkDbResetGuard(customConfig).allow);
  console.log();

  console.log("TypeScript guard - URL with ?service= query param refuses");
  process.env.ALLOW_DB_RESET = "1";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres?service=mydb";
  check("URL with ?service= refuses", false, checkDbResetGuard(customConfig).allow);
  console.log();

  console.log("TypeScript guard - Multi-host URL refuses");
  process.env.ALLOW_DB_RESET = "1";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333,other:5432/postgres";
  check("Multi-host URL refuses", false, checkDbResetGuard(customConfig).allow);
  console.log();

  console.log("TypeScript guard - [::1]:54322 refuses (IPv6 loopback on default port)");
  process.env.ALLOW_DB_RESET = "1";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@[::1]:54322/postgres";
  check("[::1]:54322 refuses", false, checkDbResetGuard(defaultConfig).allow);
  console.log();

  console.log("TypeScript guard - 127.0.0.2:54322 refuses (loopback subnet on default port)");
  process.env.ALLOW_DB_RESET = "1";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@127.0.0.2:54322/postgres";
  check("127.0.0.2:54322 refuses", false, checkDbResetGuard(defaultConfig).allow);
  console.log();

  console.log("TypeScript guard - 0.0.0.0:54322 refuses (unspecified addr on default port)");
  process.env.ALLOW_DB_RESET = "1";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@0.0.0.0:54322/postgres";
  check("0.0.0.0:54322 refuses", false, checkDbResetGuard(defaultConfig).allow);
  console.log();

  console.log("TypeScript guard - Single-quoted project_id parsed correctly");
  process.env.ALLOW_DB_RESET = "1";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres";
  process.env.SUPABASE_URL = "http://localhost:54334";
  check("Single-quoted project_id allows", true, checkDbResetGuard(singleQuoteConfig).allow);
  delete process.env.SUPABASE_URL;
  console.log();

  console.log("TypeScript guard - Comment after project_id parsed correctly");
  process.env.ALLOW_DB_RESET = "1";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres";
  process.env.SUPABASE_URL = "http://localhost:54334";
  check("Comment after project_id allows", true, checkDbResetGuard(commentConfig).allow);
  delete process.env.SUPABASE_URL;
  console.log();

  console.log("TypeScript guard - env() in project_id refuses");
  process.env.ALLOW_DB_RESET = "1";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres";
  check("env() in project_id refuses", false, checkDbResetGuard(envConfig).allow);
  console.log();

  console.log("TypeScript guard - Non-default allows");
  process.env.ALLOW_DB_RESET = "1";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres";
  process.env.SUPABASE_URL = "http://localhost:54334";
  check("Non-default allows", true, checkDbResetGuard(customConfig).allow);
  delete process.env.SUPABASE_URL;
  console.log();

  console.log("TypeScript guard - REAL_DB=1 required");
  delete process.env.REAL_DB;
  check("REAL_DB unset refuses", false, checkRealDbTest(customConfig).allow);
  process.env.REAL_DB = "1";
  process.env.CI = "true";
  check("REAL_DB=1 + CI allows", true, checkRealDbTest(customConfig).allow);
  console.log();

  if (failures > 0) {
    console.error(`\n❌ ${failures} TypeScript test(s) failed\n`);
    process.exit(1);
  }
  console.log("✅ All TypeScript tests passed\n");
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
TSTEST
echo

if [ $FAILURES -gt 0 ]; then
  echo "❌ $FAILURES bash test(s) failed"
  exit 1
fi

echo "✅ All tests passed"
exit 0
