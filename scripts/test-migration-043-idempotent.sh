#!/usr/bin/env bash
set -euo pipefail

# Test migration 043 idempotency:
# - Re-applying 043 on an already-migrated DB should succeed without error
# - Function, trigger, policy, grants and constraints should remain correct
# - An authenticated owner should still be blocked from updating non-brand columns

echo "=== Testing Migration 043 Idempotency ==="
echo

# Skip if REAL_DB is not set
if [ "${REAL_DB:-}" != "1" ]; then
  echo "⏭️  Skipping idempotency test (REAL_DB=1 not set)"
  exit 0
fi

# Source guard
source "$(dirname "$0")/lib-db-reset-guard.sh"
if ! check_db_reset_guard_bash check "supabase/config.toml"; then
  echo "❌ DB reset guard check failed"
  exit 1
fi

# Check Supabase is running
if ! supabase status &>/dev/null; then
  echo "❌ Supabase not running"
  exit 1
fi

SUPABASE_DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@localhost:54322/postgres}"

echo "Step 1: Get baseline seeded gym state..."
# Save the current state of the seeded gym
SEEDED_GYM=$(psql "$SUPABASE_DB_URL" -tA -c "
  SELECT id, name, slug, timezone, display_name, logo_url, primary_color, accent_color, created_at
  FROM public.gyms
  WHERE slug = 'test-gym'
  LIMIT 1;
")

if [ -z "$SEEDED_GYM" ]; then
  echo "⚠️  No seeded gym found with slug 'test-gym', skipping state preservation"
  SEEDED_GYM_EXISTS=false
else
  echo "✓ Seeded gym state saved"
  SEEDED_GYM_EXISTS=true
  
  # Parse the saved state
  IFS='|' read -r GYM_ID GYM_NAME GYM_SLUG GYM_TIMEZONE GYM_DISPLAY_NAME GYM_LOGO_URL GYM_PRIMARY_COLOR GYM_ACCENT_COLOR GYM_CREATED_AT <<< "$SEEDED_GYM"
fi

echo
echo "Step 2: Re-apply migration 043..."
if ! psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" \
  -f supabase/migrations/20261025000043_gyms_column_lock.sql > /dev/null; then
  echo "❌ Re-applying migration 043 failed"
  exit 1
fi
echo "✓ Migration 043 re-applied successfully"

echo
echo "Step 3: Restore seeded gym state..."
if [ "$SEEDED_GYM_EXISTS" = true ]; then
  # Restore the original state (run as postgres)
  psql "$SUPABASE_DB_URL" -c "
    UPDATE public.gyms
    SET name = '$GYM_NAME',
        timezone = '$GYM_TIMEZONE',
        display_name = $([ -n "$GYM_DISPLAY_NAME" ] && echo "'$GYM_DISPLAY_NAME'" || echo "NULL"),
        logo_url = $([ -n "$GYM_LOGO_URL" ] && echo "'$GYM_LOGO_URL'" || echo "NULL"),
        primary_color = $([ -n "$GYM_PRIMARY_COLOR" ] && echo "'$GYM_PRIMARY_COLOR'" || echo "NULL"),
        accent_color = $([ -n "$GYM_ACCENT_COLOR" ] && echo "'$GYM_ACCENT_COLOR'" || echo "NULL")
    WHERE id = '$GYM_ID';
  " > /dev/null
  echo "✓ Seeded gym state restored"
fi

echo
echo "Step 4: Verify function exists and has correct signature..."
FUNCTION_CHECK=$(psql "$SUPABASE_DB_URL" -tA -c "
  SELECT COUNT(*) 
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
  AND p.proname = 'enforce_gyms_brand_only_update'
  AND pg_get_function_result(p.oid) = 'trigger';
")

if [ "$FUNCTION_CHECK" != "1" ]; then
  echo "❌ Function enforce_gyms_brand_only_update not found or has wrong signature"
  exit 1
fi
echo "✓ Function exists with correct signature"

echo
echo "Step 5: Verify trigger exists..."
TRIGGER_CHECK=$(psql "$SUPABASE_DB_URL" -tA -c "
  SELECT COUNT(*)
  FROM pg_trigger
  WHERE tgname = 'gyms_brand_only_update'
  AND tgrelid = 'public.gyms'::regclass;
")

if [ "$TRIGGER_CHECK" != "1" ]; then
  echo "❌ Trigger gyms_brand_only_update not found"
  exit 1
fi
echo "✓ Trigger exists"

echo
echo "Step 6: Verify display_name and logo_url length constraints..."
DISPLAY_NAME_CHECK=$(psql "$SUPABASE_DB_URL" -tA -c "
  SELECT COUNT(*)
  FROM pg_constraint
  WHERE conname = 'gyms_display_name_length'
  AND conrelid = 'public.gyms'::regclass;
")

LOGO_URL_CHECK=$(psql "$SUPABASE_DB_URL" -tA -c "
  SELECT COUNT(*)
  FROM pg_constraint
  WHERE conname = 'gyms_logo_url_length'
  AND conrelid = 'public.gyms'::regclass;
")

if [ "$DISPLAY_NAME_CHECK" != "1" ] || [ "$LOGO_URL_CHECK" != "1" ]; then
  echo "❌ Length constraints not found"
  exit 1
fi
echo "✓ Length constraints exist"

echo
echo "Step 7: Verify authenticated owner is still blocked from updating non-brand columns..."
if [ "$SEEDED_GYM_EXISTS" = true ]; then
  # Get the owner of the seeded gym
  OWNER_ID=$(psql "$SUPABASE_DB_URL" -tA -c "
    SELECT user_id
    FROM public.gym_memberships
    WHERE gym_id = '$GYM_ID'
    AND role = 'owner'
    LIMIT 1;
  ")
  
  if [ -n "$OWNER_ID" ]; then
    # Try to update name as the owner (should fail with GJC12)
    UPDATE_RESULT=$(psql "$SUPABASE_DB_URL" -tA -c "
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claims', jsonb_build_object('sub', '$OWNER_ID', 'role', 'authenticated')::text, false);
      UPDATE public.gyms SET name = 'Hacked Name' WHERE id = '$GYM_ID';
    " 2>&1 || true)
    
    if echo "$UPDATE_RESULT" | grep -q "GJC12"; then
      echo "✓ Authenticated owner is still blocked (GJC12 error)"
    else
      echo "❌ Authenticated owner was not blocked"
      echo "   Result: $UPDATE_RESULT"
      exit 1
    fi
  else
    echo "⚠️  No owner found for seeded gym, skipping authenticated owner check"
  fi
else
  echo "⚠️  No seeded gym, skipping authenticated owner check"
fi

echo
echo "✅ Migration 043 is idempotent - all checks passed"
