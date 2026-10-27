#!/usr/bin/env bash
# Test: migration 040 is idempotent
# Verifies that migration 040 can be re-applied cleanly on an already-migrated database.
# This test runs only in CI on a dedicated stack.

set -euo pipefail

# Ensure this script only runs with REAL_DB=1 and proper DB safety guards
if [ "${REAL_DB:-}" != "1" ]; then
  echo "⚠️  Skipping migration-040-idempotent test (REAL_DB not set)"
  exit 0
fi

# Import and call DB reset guard (HIGH-1 requirement)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib-db-reset-guard.sh"

# Check guard before any DB operations
if ! check_db_reset_guard_bash check supabase/config.toml; then
  echo "❌ DB reset guard check failed:"
  check_db_reset_guard_bash explain supabase/config.toml
  exit 1
fi

echo "✓ DB reset guard check passed"

echo "Testing migration 040 idempotency"
echo "=================================="

# Check for psql
if ! command -v psql &> /dev/null; then
  echo "❌ psql not found (required for testing migrations)"
  exit 1
fi

# HIGH-1: Require SUPABASE_DB_URL outside CI (never derive from supabase status)
if [ "${CI:-}" != "true" ]; then
  if [ -z "${SUPABASE_DB_URL:-}" ]; then
    echo "❌ SUPABASE_DB_URL must be set outside CI"
    echo "   This prevents accidental resets of the shared local DB"
    exit 1
  fi
  DB_URL="$SUPABASE_DB_URL"
else
  # In CI, use SUPABASE_DB_URL or fall back to default
  DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@localhost:54322/postgres}"
  echo "CI: Using DB_URL: ${DB_URL%%\?*}"
fi

if [ -z "$DB_URL" ]; then
  echo "❌ No database connection available"
  exit 1
fi

echo "✓ Database connection: ${DB_URL%%\?*}"

# Step 1: Reset database to apply all migrations including 040
echo ""
echo "Step 1: Applying all migrations (including 040)..."
supabase db reset --db-url "$DB_URL"

# Verify 040 columns exist after first application
echo ""
echo "Step 2: Verifying 040 columns exist..."
COLUMN_CHECK=$(psql "$DB_URL" -t -c "
  SELECT count(*) FROM information_schema.columns 
  WHERE table_schema = 'public' 
    AND table_name = 'gyms' 
    AND column_name IN ('display_name', 'logo_url', 'primary_color', 'accent_color');
" | xargs || echo "0")

if [ "$COLUMN_CHECK" != "4" ]; then
  echo "❌ Migration 040 columns not found after first application"
  exit 1
fi
echo "✓ Migration 040 columns exist"

# Step 3: Apply migration 040 again (idempotency test)
echo ""
echo "Step 3: Re-applying migration 040 (idempotency test)..."
if ! psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261025000040_gym_branding.sql > /dev/null 2>&1; then
  echo "❌ Migration 040 failed on re-application (not idempotent)"
  exit 1
fi
echo "✓ Migration 040 can be re-applied without errors"

# Step 4: Verify get_gym_brand returns 7 columns
echo ""
echo "Step 4: Verifying get_gym_brand signature..."
RETURN_TYPE=$(psql "$DB_URL" -t -c "
  SELECT pg_get_function_result(oid) 
  FROM pg_proc 
  WHERE proname = 'get_gym_brand' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LIMIT 1;
" | xargs || echo "")

if [[ ! "$RETURN_TYPE" =~ "display_name" ]] || [[ ! "$RETURN_TYPE" =~ "primary_color" ]] || [[ ! "$RETURN_TYPE" =~ "accent_color" ]]; then
  echo "❌ get_gym_brand does not return brand columns"
  echo "   Expected: display_name, logo_url, primary_color, accent_color"
  echo "   Got: $RETURN_TYPE"
  exit 1
fi
echo "✓ get_gym_brand returns brand columns"

# Step 5: Verify set_gym_branding exists
echo ""
echo "Step 5: Verifying set_gym_branding signature..."
BRANDING_FUNC=$(psql "$DB_URL" -t -c "
  SELECT proname 
  FROM pg_proc 
  WHERE proname = 'set_gym_branding' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LIMIT 1;
" | xargs || echo "")

if [ "$BRANDING_FUNC" != "set_gym_branding" ]; then
  echo "❌ set_gym_branding function not found"
  exit 1
fi
echo "✓ set_gym_branding function exists"

# Step 6: Verify CHECK constraints exist
echo ""
echo "Step 6: Verifying CHECK constraints..."
for constraint in gyms_primary_color_hex gyms_accent_color_hex gyms_logo_url_format; do
  EXISTS=$(psql "$DB_URL" -t -c "
    SELECT count(*) 
    FROM information_schema.table_constraints 
    WHERE constraint_schema = 'public' 
      AND table_name = 'gyms' 
      AND constraint_name = '$constraint'
      AND constraint_type = 'CHECK';
  " | xargs || echo "0")
  
  if [ "$EXISTS" != "1" ]; then
    echo "❌ CHECK constraint $constraint not found"
    exit 1
  fi
  echo "✓ CHECK constraint $constraint exists"
done

echo ""
echo "✅ All migration 040 idempotency tests passed"
echo "   - Migration 040 can be re-applied on an already-migrated database"
echo "   - get_gym_brand returns brand columns"
echo "   - set_gym_branding function exists"
echo "   - CHECK constraints are in place"
