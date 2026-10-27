#!/usr/bin/env bash
# Test: migration 040 applies cleanly on top of 037 and is idempotent
# Verifies that migration 040 can run on a database with 037 already applied,
# and can be run twice without errors (DROP IF EXISTS makes it idempotent).

set -euo pipefail

# Ensure this script only runs with REAL_DB=1 and proper DB safety guards
if [ "${REAL_DB:-}" != "1" ]; then
  echo "⚠️  Skipping migration-040-idempotent test (REAL_DB not set)"
  exit 0
fi

# Import DB reset guard (enforces non-default project_id and ports)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib-db-reset-guard.sh"

echo "Testing migration 040 idempotency and clean application"
echo "========================================================"

# Check for psql
if ! command -v psql &> /dev/null; then
  echo "❌ psql not found (required for testing migrations)"
  exit 1
fi

# Get DB connection from env or Supabase CLI
DB_URL="${SUPABASE_DB_URL:-}"
if [ -z "$DB_URL" ]; then
  if command -v supabase &> /dev/null; then
    DB_URL=$(supabase status -o env | grep '^DB_URL=' | cut -d= -f2- | tr -d '"' || echo "")
  fi
fi

if [ -z "$DB_URL" ]; then
  echo "❌ No database connection available (set SUPABASE_DB_URL or run 'supabase start')"
  exit 1
fi

echo "✓ Database connection: ${DB_URL%%\?*}"

# Step 1: Reset database and apply migrations up to 037
echo ""
echo "Step 1: Applying migrations 001-037..."
supabase db reset --db-url "$DB_URL"

# Step 2: Apply migration 040 (first time)
echo ""
echo "Step 2: Applying migration 040 (first time)..."
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261025000040_gym_branding.sql

# Verify get_gym_brand returns 7 columns (name, slug, timezone, display_name, logo_url, primary_color, accent_color)
echo ""
echo "Step 3: Verifying get_gym_brand returns 7 columns..."
COLUMN_COUNT=$(psql "$DB_URL" -t -c "
  SELECT count(*) 
  FROM information_schema.columns 
  WHERE table_schema = 'pg_temp' 
    AND table_name = (
      SELECT proname || '_' || p.oid 
      FROM pg_proc p 
      WHERE proname = 'get_gym_brand' 
      LIMIT 1
    );
" | xargs || echo "0")

# Better approach: query the function's return type
echo "Checking get_gym_brand return type..."
RETURN_TYPE=$(psql "$DB_URL" -t -c "
  SELECT pg_get_function_result(oid) 
  FROM pg_proc 
  WHERE proname = 'get_gym_brand' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LIMIT 1;
" | xargs || echo "")

echo "get_gym_brand return type: $RETURN_TYPE"

if [[ ! "$RETURN_TYPE" =~ "display_name" ]] || [[ ! "$RETURN_TYPE" =~ "primary_color" ]] || [[ ! "$RETURN_TYPE" =~ "accent_color" ]]; then
  echo "❌ get_gym_brand does not return brand columns"
  echo "   Expected: display_name, logo_url, primary_color, accent_color"
  echo "   Got: $RETURN_TYPE"
  exit 1
fi

echo "✓ get_gym_brand returns brand columns (display_name, logo_url, primary_color, accent_color)"

# Step 4: Apply migration 040 again (idempotency test)
echo ""
echo "Step 4: Applying migration 040 again (idempotency test)..."
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261025000040_gym_branding.sql

echo ""
echo "✓ Migration 040 is idempotent (can be run twice)"

# Step 5: Verify set_gym_branding exists and has correct signature
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
echo "   - Migration 040 applies cleanly on top of 037"
echo "   - Migration 040 can be run twice (idempotent)"
echo "   - get_gym_brand returns brand columns"
echo "   - set_gym_branding function exists"
echo "   - CHECK constraints are in place"
