#!/usr/bin/env bash
set -euo pipefail

# Test that migration 042 can be re-applied idempotently
# Creates its own test data, asserts exact behavior

echo "=== Testing migration 042 idempotency ==="
echo

# Skip if REAL_DB is not set
if [ "${REAL_DB:-}" != "1" ]; then
  echo "⏭️  Skipping (REAL_DB=1 not set)"
  exit 0
fi

# Source guard
source "$(dirname "$0")/lib-db-reset-guard.sh"
if ! check_db_reset_guard_bash check "supabase/config.toml"; then
  echo "❌ DB reset guard check failed"
  check_db_reset_guard_bash explain "supabase/config.toml"
  exit 1
fi

SUPABASE_DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@localhost:54322/postgres}"

# Verify migration file exists
if [ ! -f "supabase/migrations/20261025000042_gym_join_codes_perf.sql" ]; then
  echo "❌ Migration 042 not found"
  exit 1
fi

echo "Creating test gym, owner and join code..."

# Create test data
GYM_ID=$(uuidgen)
OWNER_ID=$(uuidgen)
CODE_ID=$(uuidgen)
JOIN_CODE="ED3M942TST"

psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" <<SQL
-- Insert test gym
INSERT INTO public.gyms (id, slug, name, timezone)
VALUES ('$GYM_ID', 'idem-042-gym', 'Idem 042 Gym', 'UTC');

-- Create owner user
INSERT INTO auth.users (id, email, email_confirmed_at, encrypted_password, aud, role, created_at, updated_at)
VALUES ('$OWNER_ID', 'owner-idem042@example.com', now(), crypt('password123', gen_salt('bf')), 'authenticated', 'authenticated', now(), now());

-- Add owner membership
INSERT INTO public.gym_memberships (gym_id, user_id, role, status)
VALUES ('$GYM_ID', '$OWNER_ID', 'owner', 'active');

-- Create join code
INSERT INTO public.gym_join_codes (id, gym_id, code, role, created_by, use_count, max_uses)
VALUES ('$CODE_ID', '$GYM_ID', '$JOIN_CODE', 'member', '$OWNER_ID', 0, NULL);
SQL

echo "✓ Test data created"
echo

# Count visible rows before re-apply (as authenticated owner)
echo "Counting visible rows before re-apply (RLS)..."
ROW_COUNT_BEFORE=$(psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -tA <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "$OWNER_ID"}';
SELECT COUNT(*) FROM public.gym_join_codes WHERE id = '$CODE_ID';
ROLLBACK;
SQL
)
echo "Visible rows before: $ROW_COUNT_BEFORE"

if [ "$ROW_COUNT_BEFORE" != "1" ]; then
  echo "❌ FAIL: Expected 1 row before re-apply, got $ROW_COUNT_BEFORE"
  exit 1
fi

# Test redeem returns gym_name for already_member before re-apply
echo
echo "Testing redeem_join_code before re-apply..."
REDEEM_BEFORE=$(psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -tA <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "$OWNER_ID"}';
SELECT public.redeem_join_code('$JOIN_CODE');
ROLLBACK;
SQL
)
echo "Redeem result before: $REDEEM_BEFORE"

if ! echo "$REDEEM_BEFORE" | grep -q "already_member"; then
  echo "❌ FAIL: Expected already_member before re-apply"
  exit 1
fi

GYM_NAME_BEFORE=$(echo "$REDEEM_BEFORE" | jq -r '.gym_name // empty' 2>/dev/null || echo "$REDEEM_BEFORE" | grep -oP '"gym_name"\s*:\s*"\K[^"]+' || echo "")
echo "Gym name in result: $GYM_NAME_BEFORE"

if [ "$GYM_NAME_BEFORE" != "Idem 042 Gym" ]; then
  echo "❌ FAIL: Expected gym_name 'Idem 042 Gym', got: $GYM_NAME_BEFORE"
  exit 1
fi
echo "✓ gym_name correct before re-apply"

# Re-apply migration 042
echo
echo "Re-applying migration 042..."
if ! psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -f "supabase/migrations/20261025000042_gym_join_codes_perf.sql" > /dev/null 2>&1; then
  echo "❌ Re-apply failed"
  exit 1
fi
echo "✓ Re-apply succeeded"

# Count visible rows after re-apply (as authenticated owner)
echo
echo "Counting visible rows after re-apply (RLS)..."
ROW_COUNT_AFTER=$(psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -tA <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "$OWNER_ID"}';
SELECT COUNT(*) FROM public.gym_join_codes WHERE id = '$CODE_ID';
ROLLBACK;
SQL
)
echo "Visible rows after: $ROW_COUNT_AFTER"

if [ "$ROW_COUNT_AFTER" != "$ROW_COUNT_BEFORE" ]; then
  echo "❌ FAIL: Row count changed: $ROW_COUNT_BEFORE -> $ROW_COUNT_AFTER"
  exit 1
fi
echo "✓ Row count unchanged"

# Test redeem after re-apply
echo
echo "Testing redeem_join_code after re-apply..."
REDEEM_AFTER=$(psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -tA <<SQL
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "$OWNER_ID"}';
SELECT public.redeem_join_code('$JOIN_CODE');
ROLLBACK;
SQL
)
echo "Redeem result after: $REDEEM_AFTER"

if ! echo "$REDEEM_AFTER" | grep -q "already_member"; then
  echo "❌ FAIL: Expected already_member after re-apply"
  exit 1
fi

GYM_NAME_AFTER=$(echo "$REDEEM_AFTER" | jq -r '.gym_name // empty' 2>/dev/null || echo "$REDEEM_AFTER" | grep -oP '"gym_name"\s*:\s*"\K[^"]+' || echo "")
echo "Gym name in result: $GYM_NAME_AFTER"

if [ "$GYM_NAME_BEFORE" != "$GYM_NAME_AFTER" ]; then
  echo "❌ FAIL: gym_name changed: $GYM_NAME_BEFORE -> $GYM_NAME_AFTER"
  exit 1
fi
echo "✓ gym_name unchanged"

echo
echo "Cleaning up test data..."
psql "$SUPABASE_DB_URL" <<SQL
DELETE FROM public.gym_join_codes WHERE id = '$CODE_ID';
DELETE FROM public.gym_memberships WHERE gym_id = '$GYM_ID';
DELETE FROM public.gyms WHERE id = '$GYM_ID';
DELETE FROM auth.users WHERE id = '$OWNER_ID';
SQL
echo "✓ Test data cleaned up"

echo
echo "✅ Migration 042 is idempotent"
exit 0
