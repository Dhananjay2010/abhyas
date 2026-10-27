#!/usr/bin/env bash
set -euo pipefail

# Pure tests for db-reset-guard logic (bash and TypeScript)
# NO database operations, NO exec, NO network calls
# Just test the pure decision functions
#
# Each refuse case starts from GOOD_ENV (all vars set correctly) and changes
# exactly ONE thing, then asserts the specific refusal reason.

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

# Check that a command refuses with a specific reason substring
check_refuse() {
  local label="$1"
  local reason_substring="$2"
  shift 2
  
  local output
  if output=$("$@" 2>&1); then
    echo "  ✗ $label: guard ALLOWed (should refuse)"
    FAILURES=$((FAILURES + 1))
    return 1
  else
    if echo "$output" | grep -q "$reason_substring"; then
      echo "  ✓ $label: refused with '$reason_substring'"
    else
      echo "  ✗ $label: refused but reason missing '$reason_substring'"
      echo "     Got: $output"
      FAILURES=$((FAILURES + 1))
      return 1
    fi
  fi
}

# Source the bash guard
source "$(dirname "$0")/lib-db-reset-guard.sh"

# Create a temp directory with test config files
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# Config with both [db] and [api] sections (non-default ports)
cat > "$TMPDIR/custom-config.toml" << 'EOF'
project_id = "TestGym"

[db]
port = 54333

[api]
port = 54334
EOF

# Config with default ports (for testing default port refusal)
cat > "$TMPDIR/default-config.toml" << 'EOF'
project_id = "TestGym"

[db]
port = 54322

[api]
port = 54321
EOF

# GOOD_ENV for non-CI allow cases
export ALLOW_DB_RESET="1"
export SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres"
export SUPABASE_URL="http://localhost:54334"
export NEXT_PUBLIC_SUPABASE_URL="http://localhost:54334"
unset CI
unset SUPABASE_PROJECT_ID
unset SUPABASE_DB_PORT
unset SUPABASE_WORKDIR
unset PGHOST
unset PGPORT
unset PGSERVICE
unset PGHOSTADDR

echo "TEST: Positive control - GOOD_ENV should ALLOW"
if check_db_reset_guard_bash check "$TMPDIR/custom-config.toml"; then
  check "GOOD_ENV allows" "0" "0"
else
  check "GOOD_ENV allows" "0" "1"
fi
echo

echo "TEST: CI=true allows unconditionally"
export CI="true"
export ALLOW_DB_RESET="0"
unset SUPABASE_DB_URL
unset SUPABASE_URL
unset NEXT_PUBLIC_SUPABASE_URL
if check_db_reset_guard_bash check "$TMPDIR/custom-config.toml"; then
  check "CI=true allows (ignores everything)" "0" "0"
else
  check "CI=true allows (ignores everything)" "0" "1"
fi
# Restore GOOD_ENV
unset CI
export ALLOW_DB_RESET="1"
export SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres"
export SUPABASE_URL="http://localhost:54334"
export NEXT_PUBLIC_SUPABASE_URL="http://localhost:54334"
echo

echo "TEST: Bash guard single-violation refuse cases"
echo

check_refuse "Missing ALLOW_DB_RESET" "ALLOW_DB_RESET" \
  bash -c 'unset ALLOW_DB_RESET; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

check_refuse "CI=1 (not true)" "CI" \
  bash -c 'CI=1; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

check_refuse "SUPABASE_PROJECT_ID set" "SUPABASE_PROJECT_ID" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" SUPABASE_URL="http://localhost:54334" NEXT_PUBLIC_SUPABASE_URL="http://localhost:54334" SUPABASE_PROJECT_ID=TestGym; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

check_refuse "SUPABASE_DB_PORT set" "SUPABASE_DB_PORT" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" SUPABASE_URL="http://localhost:54334" NEXT_PUBLIC_SUPABASE_URL="http://localhost:54334" SUPABASE_DB_PORT=54333; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

check_refuse "SUPABASE_WORKDIR set" "SUPABASE_WORKDIR" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" SUPABASE_URL="http://localhost:54334" NEXT_PUBLIC_SUPABASE_URL="http://localhost:54334" SUPABASE_WORKDIR=/tmp; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

check_refuse "Unknown SUPABASE_* key" "SUPABASE_ACCESS_TOKEN" \
  bash -c 'export ALLOW_DB_RESET=1; export SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres"; export SUPABASE_URL="http://localhost:54334"; export NEXT_PUBLIC_SUPABASE_URL="http://localhost:54334"; export SUPABASE_ACCESS_TOKEN=xyz; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

check_refuse "PGHOST set" "PGHOST" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" SUPABASE_URL="http://localhost:54334" NEXT_PUBLIC_SUPABASE_URL="http://localhost:54334" PGHOST=localhost; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

check_refuse "PGPORT set" "PGPORT" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" SUPABASE_URL="http://localhost:54334" NEXT_PUBLIC_SUPABASE_URL="http://localhost:54334" PGPORT=54333; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

check_refuse "PGSERVICE set" "PGSERVICE" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" SUPABASE_URL="http://localhost:54334" NEXT_PUBLIC_SUPABASE_URL="http://localhost:54334" PGSERVICE=myservice; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

check_refuse "PGHOSTADDR set" "PGHOSTADDR" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" SUPABASE_URL="http://localhost:54334" NEXT_PUBLIC_SUPABASE_URL="http://localhost:54334" PGHOSTADDR=127.0.0.1; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

check_refuse "Default port 54322" "default" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54322/postgres" SUPABASE_URL="http://localhost:54321" NEXT_PUBLIC_SUPABASE_URL="http://localhost:54321"; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/default-config.toml"'"'

# Create Fitness config for test
cat > "$TMPDIR/fitness-config.toml" << 'EOF'
project_id = "Fitness"

[db]
port = 54333

[api]
port = 54334
EOF

check_refuse "Default project_id Fitness" "Fitness" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" SUPABASE_URL="http://localhost:54334" NEXT_PUBLIC_SUPABASE_URL="http://localhost:54334"; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/fitness-config.toml"'"'


check_refuse "DB URL with ?" "?" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres?port=54322" SUPABASE_URL="http://localhost:54334" NEXT_PUBLIC_SUPABASE_URL="http://localhost:54334"; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

check_refuse "DB URL with %" "%" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:%70assword@localhost:54333/postgres" SUPABASE_URL="http://localhost:54334" NEXT_PUBLIC_SUPABASE_URL="http://localhost:54334"; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

check_refuse "DB URL remote host" "not a local address" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:postgres@10.1.2.3:54333/postgres" SUPABASE_URL="http://10.1.2.3:54334" NEXT_PUBLIC_SUPABASE_URL="http://10.1.2.3:54334"; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

check_refuse "DB URL port mismatch" "must match config.toml" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:5432/postgres" SUPABASE_URL="http://localhost:54334" NEXT_PUBLIC_SUPABASE_URL="http://localhost:54334"; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

check_refuse "Multi-host URL" "multiple hosts" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333,other:5432/postgres" SUPABASE_URL="http://localhost:54334" NEXT_PUBLIC_SUPABASE_URL="http://localhost:54334"; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

check_refuse "SUPABASE_URL unset" "SUPABASE_URL is required" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" unset SUPABASE_URL; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

check_refuse "SUPABASE_URL with ?" "?" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" SUPABASE_URL="http://localhost:54334?key=val" NEXT_PUBLIC_SUPABASE_URL="http://localhost:54334?key=val"; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

check_refuse "SUPABASE_URL with %" "%" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" SUPABASE_URL="http://localhost:54334/%20path" NEXT_PUBLIC_SUPABASE_URL="http://localhost:54334/%20path"; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

check_refuse "SUPABASE_URL remote host" "not a local address" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" SUPABASE_URL="http://192.168.1.100:54334" NEXT_PUBLIC_SUPABASE_URL="http://192.168.1.100:54334"; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

check_refuse "SUPABASE_URL port mismatch" "must match config.toml" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" SUPABASE_URL="http://localhost:8080" NEXT_PUBLIC_SUPABASE_URL="http://localhost:8080"; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

check_refuse "SUPABASE_URL default port 54321" "default 54321" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54322/postgres" SUPABASE_URL="http://localhost:54321" NEXT_PUBLIC_SUPABASE_URL="http://localhost:54321"; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

check_refuse "NEXT_PUBLIC_SUPABASE_URL unset" "NEXT_PUBLIC_SUPABASE_URL is required" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" SUPABASE_URL="http://localhost:54334" unset NEXT_PUBLIC_SUPABASE_URL; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

check_refuse "NEXT_PUBLIC_SUPABASE_URL mismatch" "must match SUPABASE_URL" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54333/postgres" SUPABASE_URL="http://localhost:54334" NEXT_PUBLIC_SUPABASE_URL="http://localhost:54399"; source scripts/lib-db-reset-guard.sh; check_db_reset_guard_bash explain "'"$TMPDIR/custom-config.toml"'"'

# URL normalization tests
check_refuse "NEXT_PUBLIC 127.0.0.1 vs SUPABASE_URL localhost (normalized)" "0" \
  bash -c 'ALLOW_DB_RESET=1 SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:54333/postgres" SUPABASE_URL="http://localhost:54334" NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54334"; source scripts/lib-db-reset-guard.sh; if check_db_reset_guard_bash check "'"$TMPDIR/custom-config.toml"'"; then echo "0"; else echo "1"; fi'

echo
echo "TEST: TypeScript guard via tsx"
npx tsx << 'TSTEST'
import { checkDbResetGuard } from "./scripts/lib-db-reset-guard";
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

function checkRefuse(label: string, reasonSubstring: string, fn: () => { allow: boolean; reason: string }) {
  const result = fn();
  if (result.allow) {
    console.log(`  ✗ ${label}: guard ALLOWed (should refuse)`);
    failures++;
  } else if (result.reason.includes(reasonSubstring)) {
    console.log(`  ✓ ${label}: refused with '${reasonSubstring}'`);
  } else {
    console.log(`  ✗ ${label}: refused but reason missing '${reasonSubstring}'`);
    console.log(`     Got: ${result.reason}`);
    failures++;
  }
}

const tmpDir = mkdtempSync("/tmp/tstest-");
const customConfig = join(tmpDir, "custom.toml");
writeFileSync(customConfig, 'project_id = "TestGym"\n\n[db]\nport = 54333\n\n[api]\nport = 54334\n');

try {
  console.log("TypeScript guard - Positive control (GOOD_ENV allows)");
  process.env.ALLOW_DB_RESET = "1";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres";
  process.env.SUPABASE_URL = "http://localhost:54334";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54334";
  delete process.env.CI;
  delete process.env.SUPABASE_PROJECT_ID;
  delete process.env.SUPABASE_DB_PORT;
  delete process.env.SUPABASE_WORKDIR;
  delete process.env.PGHOST;
  delete process.env.PGPORT;
  delete process.env.PGSERVICE;
  delete process.env.PGHOSTADDR;
  check("GOOD_ENV allows", true, checkDbResetGuard(customConfig).allow);
  console.log();

  console.log("TypeScript guard - CI=true allows unconditionally");
  process.env.CI = "true";
  process.env.ALLOW_DB_RESET = "0";
  delete process.env.SUPABASE_DB_URL;
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  check("CI=true allows", true, checkDbResetGuard(customConfig).allow);
  console.log();

  // Restore GOOD_ENV for refuse tests
  delete process.env.CI;
  process.env.ALLOW_DB_RESET = "1";
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres";
  process.env.SUPABASE_URL = "http://localhost:54334";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54334";

  console.log("TypeScript guard - Single-violation refuse cases");
  console.log();

  checkRefuse("Missing ALLOW_DB_RESET", "ALLOW_DB_RESET", () => {
    delete process.env.ALLOW_DB_RESET;
    const result = checkDbResetGuard(customConfig);
    process.env.ALLOW_DB_RESET = "1";
    return result;
  });

  checkRefuse("CI=1 (not true)", "CI", () => {
    process.env.CI = "1";
    const result = checkDbResetGuard(customConfig);
    delete process.env.CI;
    return result;
  });

  checkRefuse("SUPABASE_PROJECT_ID set", "SUPABASE_PROJECT_ID", () => {
    process.env.SUPABASE_PROJECT_ID = "TestGym";
    const result = checkDbResetGuard(customConfig);
    delete process.env.SUPABASE_PROJECT_ID;
    return result;
  });

  checkRefuse("SUPABASE_DB_PORT set", "SUPABASE_DB_PORT", () => {
    process.env.SUPABASE_DB_PORT = "54333";
    const result = checkDbResetGuard(customConfig);
    delete process.env.SUPABASE_DB_PORT;
    return result;
  });

  checkRefuse("SUPABASE_WORKDIR set", "SUPABASE_WORKDIR", () => {
    process.env.SUPABASE_WORKDIR = "/tmp";
    const result = checkDbResetGuard(customConfig);
    delete process.env.SUPABASE_WORKDIR;
    return result;
  });

  checkRefuse("Unknown SUPABASE_* key", "SUPABASE_ACCESS_TOKEN", () => {
    process.env.SUPABASE_ACCESS_TOKEN = "xyz";
    const result = checkDbResetGuard(customConfig);
    delete process.env.SUPABASE_ACCESS_TOKEN;
    return result;
  });

  checkRefuse("PGHOST set", "PGHOST", () => {
    process.env.PGHOST = "localhost";
    const result = checkDbResetGuard(customConfig);
    delete process.env.PGHOST;
    return result;
  });

  checkRefuse("PGPORT set", "PGPORT", () => {
    process.env.PGPORT = "54333";
    const result = checkDbResetGuard(customConfig);
    delete process.env.PGPORT;
    return result;
  });

  checkRefuse("PGSERVICE set", "PGSERVICE", () => {
    process.env.PGSERVICE = "myservice";
    const result = checkDbResetGuard(customConfig);
    delete process.env.PGSERVICE;
    return result;
  });

  checkRefuse("PGHOSTADDR set", "PGHOSTADDR", () => {
    process.env.PGHOSTADDR = "127.0.0.1";
    const result = checkDbResetGuard(customConfig);
    delete process.env.PGHOSTADDR;
    return result;
  });

  checkRefuse("Default port 54322", "default", () => {
    process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54322/postgres";
    process.env.SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    const result = checkDbResetGuard(customConfig);
    process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres";
    process.env.SUPABASE_URL = "http://localhost:54334";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54334";
    return result;
  });

  checkRefuse("Default project_id Fitness", "Fitness", () => {
    const defaultProjConfig = join(tmpDir, "default-proj.toml");
    writeFileSync(defaultProjConfig, 'project_id = "Fitness"\n\n[db]\nport = 54333\n\n[api]\nport = 54334\n');
    const result = checkDbResetGuard(defaultProjConfig);
    return result;
  });

  checkRefuse("DB URL with ?", "?", () => {
    process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres?port=54322";
    const result = checkDbResetGuard(customConfig);
    process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres";
    return result;
  });

  checkRefuse("DB URL with %", "%", () => {
    process.env.SUPABASE_DB_URL = "postgresql://postgres:%70assword@localhost:54333/postgres";
    const result = checkDbResetGuard(customConfig);
    process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres";
    return result;
  });

  checkRefuse("DB URL remote host", "not a local address", () => {
    process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@10.1.2.3:54333/postgres";
    process.env.SUPABASE_URL = "http://10.1.2.3:54334";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://10.1.2.3:54334";
    const result = checkDbResetGuard(customConfig);
    process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres";
    process.env.SUPABASE_URL = "http://localhost:54334";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54334";
    return result;
  });

  checkRefuse("DB URL port mismatch", "must match config.toml", () => {
    process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:5432/postgres";
    const result = checkDbResetGuard(customConfig);
    process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres";
    return result;
  });

  checkRefuse("Multi-host URL", "multiple hosts", () => {
    process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333,other:5432/postgres";
    const result = checkDbResetGuard(customConfig);
    process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@localhost:54333/postgres";
    return result;
  });

  checkRefuse("SUPABASE_URL unset", "SUPABASE_URL is required", () => {
    delete process.env.SUPABASE_URL;
    const result = checkDbResetGuard(customConfig);
    process.env.SUPABASE_URL = "http://localhost:54334";
    return result;
  });

  checkRefuse("SUPABASE_URL with ?", "?", () => {
    process.env.SUPABASE_URL = "http://localhost:54334?key=val";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54334?key=val";
    const result = checkDbResetGuard(customConfig);
    process.env.SUPABASE_URL = "http://localhost:54334";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54334";
    return result;
  });

  checkRefuse("SUPABASE_URL with %", "%", () => {
    process.env.SUPABASE_URL = "http://localhost:54334/%20path";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54334/%20path";
    const result = checkDbResetGuard(customConfig);
    process.env.SUPABASE_URL = "http://localhost:54334";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54334";
    return result;
  });

  checkRefuse("SUPABASE_URL remote host", "not a local address", () => {
    process.env.SUPABASE_URL = "http://192.168.1.100:54334";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://192.168.1.100:54334";
    const result = checkDbResetGuard(customConfig);
    process.env.SUPABASE_URL = "http://localhost:54334";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54334";
    return result;
  });

  checkRefuse("SUPABASE_URL port mismatch", "must match config.toml", () => {
    process.env.SUPABASE_URL = "http://localhost:8080";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:8080";
    const result = checkDbResetGuard(customConfig);
    process.env.SUPABASE_URL = "http://localhost:54334";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54334";
    return result;
  });

  checkRefuse("SUPABASE_URL default port 54321", "default 54321", () => {
    process.env.SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    const result = checkDbResetGuard(customConfig);
    process.env.SUPABASE_URL = "http://localhost:54334";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54334";
    return result;
  });

  checkRefuse("NEXT_PUBLIC_SUPABASE_URL unset", "NEXT_PUBLIC_SUPABASE_URL is required", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const result = checkDbResetGuard(customConfig);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54334";
    return result;
  });

  checkRefuse("NEXT_PUBLIC_SUPABASE_URL mismatch", "must match SUPABASE_URL", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54399";
    const result = checkDbResetGuard(customConfig);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54334";
    return result;
  });

  // URL normalization test (localhost vs 127.0.0.1 should match)
  console.log("TypeScript guard - URL normalization (localhost vs 127.0.0.1)");
  process.env.SUPABASE_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54333/postgres";
  process.env.SUPABASE_URL = "http://localhost:54334";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54334";
  check("localhost vs 127.0.0.1 normalized", true, checkDbResetGuard(customConfig).allow);
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
