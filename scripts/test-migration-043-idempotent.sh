#!/usr/bin/env bash
set -euo pipefail

# Test that migration 043 can be re-applied idempotently
# Creates its own test data, does not rely on seed

echo "=== Testing migration 043 idempotency ==="
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
if [ ! -f "supabase/migrations/20261025000043_gyms_column_lock.sql" ]; then
  echo "❌ Migration 043 not found"
  exit 1
fi

echo "Creating test gym and owner..."

# Create test gym and owner via psql
GYM_ID=$(uuidgen)
OWNER_EMAIL="owner-idem043-$RANDOM@example.com"

psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" <<SQL
-- Insert test gym
INSERT INTO public.gyms (id, slug, name, timezone, display_name, primary_color, accent_color)
VALUES ('$GYM_ID', 'idem-043-gym', 'Idem 043 Gym', 'UTC', 'Test Display', '#FF9A2E', '#0A0C0E');

-- Create owner user via auth schema
INSERT INTO auth.users (id, email, email_confirmed_at, encrypted_password, aud, role, created_at, updated_at)
VALUES (gen_random_uuid(), '$OWNER_EMAIL', now(), crypt('password123', gen_salt('bf')), 'authenticated', 'authenticated', now(), now())
RETURNING id \gset owner_

-- Add owner membership
INSERT INTO public.gym_memberships (gym_id, user_id, role, status)
VALUES ('$GYM_ID', :'owner_id', 'owner', 'active');
SQL

echo "✓ Test data created"
echo

# Read gym data before re-apply
echo "Reading gym state before re-apply..."
BEFORE_DATA=$(psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -tA -c "SELECT id, slug, name, timezone, display_name, primary_color, accent_color FROM public.gyms WHERE id = '$GYM_ID'")
echo "Before: $BEFORE_DATA"

# Re-apply migration 043
echo
echo "Re-applying migration 043..."
if ! psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -f "supabase/migrations/20261025000043_gyms_column_lock.sql" > /dev/null 2>&1; then
  echo "❌ Re-apply failed"
  exit 1
fi
echo "✓ Re-apply succeeded"

# Read gym data after re-apply
echo
echo "Reading gym state after re-apply..."
AFTER_DATA=$(psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -tA -c "SELECT id, slug, name, timezone, display_name, primary_color, accent_color FROM public.gyms WHERE id = '$GYM_ID'")
echo "After:  $AFTER_DATA"

# Compare
if [ "$BEFORE_DATA" != "$AFTER_DATA" ]; then
  echo "❌ FAIL: Gym data changed after re-apply"
  exit 1
fi
echo "✓ Gym data unchanged"

# Test GJC12 still works after re-apply
echo
echo "Testing GJC12 enforcement after re-apply..."
ERROR_OUTPUT=$(psql -q -v VERBOSITY=verbose "$SUPABASE_DB_URL" <<SQL 2>&1 || true
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "$(psql -q -tA "$SUPABASE_DB_URL" -c "SELECT user_id FROM public.gym_memberships WHERE gym_id = '$GYM_ID' AND role = 'owner' LIMIT 1")"}';
UPDATE public.gyms SET name = 'Hacked' WHERE id = '$GYM_ID';
ROLLBACK;
SQL
)

if ! echo "$ERROR_OUTPUT" | grep -q "GJC12"; then
  echo "❌ FAIL: GJC12 not enforced after re-apply"
  echo "$ERROR_OUTPUT"
  exit 1
fi
echo "✓ GJC12 enforced"

echo
echo "Cleaning up test data..."
psql "$SUPABASE_DB_URL" <<SQL
DELETE FROM public.gym_memberships WHERE gym_id = '$GYM_ID';
DELETE FROM public.gyms WHERE id = '$GYM_ID';
DELETE FROM auth.users WHERE email LIKE 'owner-idem043-%';
SQL
echo "✓ Test data cleaned up"

echo
echo "✅ Migration 043 is idempotent"
exit 0
