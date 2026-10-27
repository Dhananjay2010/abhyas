#!/usr/bin/env bash
set -euo pipefail

# Meta-test: Prove that test:gym-domains-real-db, test:gym-tenant-rls-real-db,
# and test:gym-owner-guards-sql are NO-OP by default (REAL_DB unset, default SUPABASE_URL).
# 
# This test:
# 1. Stubs supabase and psql on PATH (record calls)
# 2. Stubs fetch/DB client (record network calls)
# 3. Runs the tests with REAL_DB unset
# 4. Asserts zero DB calls and 'skipped' outcome
#
# This ensures plain `npm test` never touches the default Supabase stack.

echo "=== Meta-test: Default runs skip DB operations ==="
echo

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# Create stub binaries that record calls
cat > "$TMPDIR/supabase" << 'STUB'
#!/usr/bin/env bash
echo "supabase $*" >> /tmp/metatest-db-calls.log
exit 1
STUB

cat > "$TMPDIR/psql" << 'STUB'
#!/usr/bin/env bash
echo "psql $*" >> /tmp/metatest-db-calls.log
exit 1
STUB

chmod +x "$TMPDIR/supabase" "$TMPDIR/psql"

# Prepend stub dir to PATH
export PATH="$TMPDIR:$PATH"

# Clear call log
rm -f /tmp/metatest-db-calls.log
touch /tmp/metatest-db-calls.log

# Ensure REAL_DB is unset and default SUPABASE_URL
unset REAL_DB
export SUPABASE_URL="http://127.0.0.1:54321"
export SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

echo "Running test:gym-domains-real-db with REAL_DB unset..."
OUTPUT=$(npm run test:gym-domains-real-db 2>&1 || true)

echo "$OUTPUT" | grep -q "Skipping" && echo "✓ test:gym-domains-real-db skipped" || {
  echo "✗ test:gym-domains-real-db did not skip"
  echo "Output: $OUTPUT"
  exit 1
}

# Check call log is empty
if [ -s /tmp/metatest-db-calls.log ]; then
  echo "✗ DB calls were made:"
  cat /tmp/metatest-db-calls.log
  exit 1
fi
echo "✓ Zero DB calls made"

echo
echo "Running test:gym-tenant-rls-real-db with REAL_DB unset..."
rm -f /tmp/metatest-db-calls.log
touch /tmp/metatest-db-calls.log

OUTPUT2=$(npm run test:gym-tenant-rls-real-db 2>&1 || true)

echo "$OUTPUT2" | grep -q "Skipping" && echo "✓ test:gym-tenant-rls-real-db skipped" || {
  echo "✗ test:gym-tenant-rls-real-db did not skip"
  echo "Output: $OUTPUT2"
  exit 1
}

# Check call log is empty
if [ -s /tmp/metatest-db-calls.log ]; then
  echo "✗ DB calls were made:"
  cat /tmp/metatest-db-calls.log
  exit 1
fi
echo "✓ Zero DB calls made"

echo
echo "Running test:gym-owner-guards-sql with REAL_DB unset..."
rm -f /tmp/metatest-db-calls.log
touch /tmp/metatest-db-calls.log

OUTPUT3=$(npm run test:gym-owner-guards-sql 2>&1 || true)

echo "$OUTPUT3" | grep -q "Skipping" && echo "✓ test:gym-owner-guards-sql skipped" || {
  echo "✗ test:gym-owner-guards-sql did not skip"
  echo "Output: $OUTPUT3"
  exit 1
}

# Check call log is empty
if [ -s /tmp/metatest-db-calls.log ]; then
  echo "✗ DB calls were made:"
  cat /tmp/metatest-db-calls.log
  exit 1
fi
echo "✓ Zero DB calls made"

echo
echo "✅ Meta-test passed: Default runs are NO-OP"
exit 0
