#!/usr/bin/env bash
set -uo pipefail

# Mutant test script for gyms column lock (migration 043)
# Tests that removing key constraints causes test failures
# Mutants (a-h, m-n) built by sed over 043; (i-k, o-r) undo 040 CHECKs after reset

echo "=== Mutant Testing: Gyms Column Lock (Migration 043) ==="
echo

# Skip if REAL_DB is not set
if [ "${REAL_DB:-}" != "1" ]; then
  echo "⏭️  Skipping mutant tests (REAL_DB=1 not set)"
  echo "   Set REAL_DB=1 to run these tests against a local Supabase instance"
  echo
  exit 0
fi

# Source guard and check
source "$(dirname "$0")/lib-db-reset-guard.sh"
if ! check_db_reset_guard_bash check "supabase/config.toml"; then
  echo "❌ DB reset guard check failed:"
  check_db_reset_guard_bash explain "supabase/config.toml"
  exit 1
fi

# In CI, default SUPABASE_DB_URL if not set
if [ "${CI:-}" = "true" ] && [ -z "${SUPABASE_DB_URL:-}" ]; then
  export SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54322/postgres"
  echo "CI: Using default SUPABASE_DB_URL"
  echo
fi

# Check we're in the repo root
if [ ! -f "package.json" ] || [ ! -f "supabase/migrations/20261025000043_gyms_column_lock.sql" ]; then
  echo "❌ ERROR: Must run from repo root with migration 043 present" >&2
  exit 1
fi

# Test that Supabase is running
if ! supabase status &>/dev/null; then
  echo "❌ Supabase not running. Start it with: supabase start"
  exit 1
fi

FAILED=0
SURVIVORS=()
SKIPPED=()
KILLED=0
TOTAL_MUTANTS=18

echo "Running baseline tests..."
BASELINE_OUTPUT=$(mktemp)

# Use main's reset pattern: plain only in CI with default URL
if [ "${CI:-}" = "true" ] && [ "${SUPABASE_DB_URL:-}" = "postgresql://postgres:postgres@localhost:54322/postgres" ]; then
  RESET_CMD="supabase db reset"
else
  RESET_CMD="supabase db reset --db-url \"$SUPABASE_DB_URL\""
fi

if ! eval "$RESET_CMD" > "$BASELINE_OUTPUT" 2>&1; then
  echo "❌ Baseline: db reset failed" >&2
  cat "$BASELINE_OUTPUT"
  rm -f "$BASELINE_OUTPUT"
  exit 1
fi

if ! REAL_DB=1 npm run test:gyms-column-lock-real-db > "$BASELINE_OUTPUT" 2>&1; then
  echo "❌ Baseline tests failed. Fix the code before running mutant tests." >&2
  echo "Full baseline output:"
  cat "$BASELINE_OUTPUT"
  rm -f "$BASELINE_OUTPUT"
  exit 1
fi
rm -f "$BASELINE_OUTPUT"
echo "✓ Baseline tests pass"
echo

run_mutant() {
  local name="$1"
  local description="$2"
  local sed_pattern="$3"
  local expected_fail="$4"
  local undo_sql="${5:-}"
  
  echo "Testing mutant: $name"
  echo "  $description"
  
  # Check if no mutation is specified
  if [ -z "$sed_pattern" ] && [ -z "$undo_sql" ]; then
    echo "  ❌ SKIP: no mutation specified"
    SKIPPED+=("$name: no mutation")
    FAILED=$((FAILED + 1))
    return 1
  fi
  
  # Reset database
  local reset_output=$(mktemp)
  if ! eval "$RESET_CMD" > "$reset_output" 2>&1; then
    echo "  ❌ SKIP: db reset failed"
    SKIPPED+=("$name: db reset failed")
    FAILED=$((FAILED + 1))
    rm -f "$reset_output"
    return 1
  fi
  rm -f "$reset_output"
  
  # Apply mutation - either sed or undo SQL
  if [ -n "$sed_pattern" ]; then
    # Build mutated migration with sed
    local mutated_migration=$(mktemp)
    if ! sed "$sed_pattern" "supabase/migrations/20261025000043_gyms_column_lock.sql" > "$mutated_migration"; then
      echo "  ❌ SKIP: sed command failed"
      SKIPPED+=("$name: sed failed")
      FAILED=$((FAILED + 1))
      rm -f "$mutated_migration"
      return 1
    fi
    
    # Verify sed changed something
    if cmp -s "supabase/migrations/20261025000043_gyms_column_lock.sql" "$mutated_migration"; then
      echo "  ❌ SKIP: sed produced no change (mutation ineffective)"
      SKIPPED+=("$name: no change")
      FAILED=$((FAILED + 1))
      rm -f "$mutated_migration"
      return 1
    fi
    
    # Apply mutated migration via psql
    local mutation_output=$(mktemp)
    if ! psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -f "$mutated_migration" > "$mutation_output" 2>&1; then
      echo "  ❌ SKIP: mutation SQL failed"
      echo "  psql error:"
      cat "$mutation_output" | sed 's/^/    /'
      SKIPPED+=("$name: mutation failed")
      FAILED=$((FAILED + 1))
      rm -f "$mutation_output" "$mutated_migration"
      return 1
    fi
    rm -f "$mutation_output" "$mutated_migration"
  fi
  
  # Apply undo SQL if present (can be combined with sed)
  if [ -n "$undo_sql" ]; then
    # For undo-SQL mutants, check if the constraint mutation is a no-op
    if [ -z "$sed_pattern" ]; then
      # Derive constraint name from the undo SQL
      local constraint_name=$(printf '%s\n' "$undo_sql" | sed -n '1s/^ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS \([a-z_]*\);$/\1/p')
      
      if [ -n "$constraint_name" ]; then
        # Check if undo SQL has more than 1 line (i.e., an ADD CONSTRAINT)
        local line_count=$(printf '%s\n' "$undo_sql" | wc -l)
        if [ "$line_count" -gt 1 ]; then
          # Extract the constraint from 040
          local constraint_pattern="/add constraint $constraint_name/,/);/"
          local original_block=$(sed -n "$constraint_pattern"p supabase/migrations/20261025000040_gym_branding.sql)
          
          # Check if extraction is empty
          if [ -z "$original_block" ]; then
            echo "  ❌ SKIP: could not extract 040 block for $constraint_name"
            SKIPPED+=("$name: empty block")
            FAILED=$((FAILED + 1))
            return 1
          fi
          
          # Extract lines 2 onward from undo_sql (the ADD CONSTRAINT part)
          local mutated_block=$(printf '%s\n' "$undo_sql" | tail -n +2)
          
          # Compare
          if [ "$original_block" = "$mutated_block" ]; then
            echo "  ❌ SKIP: mutation produced no change"
            SKIPPED+=("$name: no change")
            FAILED=$((FAILED + 1))
            return 1
          fi
        fi
      fi
    fi
    
    local undo_output=$(mktemp)
    if ! psql -v ON_ERROR_STOP=1 "$SUPABASE_DB_URL" -c "$undo_sql" > "$undo_output" 2>&1; then
      echo "  ❌ SKIP: undo SQL failed"
      echo "  psql error:"
      cat "$undo_output" | sed 's/^/    /'
      SKIPPED+=("$name: undo failed")
      FAILED=$((FAILED + 1))
      rm -f "$undo_output"
      return 1
    fi
    rm -f "$undo_output"
  fi
  
  # Run tests and capture output
  local test_output=$(mktemp)
  if REAL_DB=1 npm run test:gyms-column-lock-real-db > "$test_output" 2>&1; then
    echo "  ❌ SURVIVED (tests passed when they should have failed)"
    echo "  Last 20 lines of test output:"
    tail -20 "$test_output" | sed 's/^/    /'
    SURVIVORS+=("$name")
    FAILED=$((FAILED + 1))
    rm -f "$test_output"
    return 1
  fi
  
  # Check for expected failure message
  if grep -qF "$expected_fail" "$test_output"; then
    echo "  ✅ KILLED by expected assertion"
    KILLED=$((KILLED + 1))
  else
    echo "  ❌ SKIP: killed but not by expected assertion"
    echo "  Expected: $expected_fail"
    echo "  Actual FAIL lines:"
    grep "FAIL" "$test_output" | head -3 | sed 's/^/    /' || echo "    (no FAIL lines found)"
    SKIPPED+=("$name: wrong assertion")
    FAILED=$((FAILED + 1))
    rm -f "$test_output"
    return 1
  fi
  
  rm -f "$test_output"
  return 0
}

# Mutant (a): Remove the trigger entirely
run_mutant \
  "(a) remove trigger" \
  "Drop the gyms_brand_only_update trigger" \
  "" \
  "FAIL Update slug blocked" \
  "DROP TRIGGER IF EXISTS gyms_brand_only_update ON public.gyms;"

# Mutant (b): Add slug to brand columns allow-list
run_mutant \
  "(b) add slug to allow-list" \
  "Allow slug updates by adding it to v_brand_columns" \
  "s/v_brand_columns text\[\] := array\['display_name', 'logo_url', 'primary_color', 'accent_color'\];/v_brand_columns text[] := array['display_name', 'logo_url', 'primary_color', 'accent_color', 'slug'];/" \
  "FAIL Update slug blocked"

# Mutant (c): Remove service_role from privileged bypass
run_mutant \
  "(c) drop service_role from bypass" \
  "Block service_role from updating protected columns" \
  "s/if current_user in ('service_role', 'postgres')/if current_user in ('postgres')/" \
  "FAIL service_role can update timezone"

# Mutant (d): Change current_user to session_user (different bypass check)
run_mutant \
  "(d) session_user instead of current_user" \
  "Use session_user instead of current_user for bypass" \
  "s/if current_user in ('service_role', 'postgres')/if session_user in ('service_role', 'postgres')/" \
  "FAIL service_role can update timezone"

# Mutant (e): Add name to brand columns allow-list
run_mutant \
  "(e) add name to allow-list" \
  "Allow name updates by adding it to v_brand_columns" \
  "s/v_brand_columns text\[\] := array\['display_name', 'logo_url', 'primary_color', 'accent_color'\];/v_brand_columns text[] := array['display_name', 'logo_url', 'primary_color', 'accent_color', 'name'];/" \
  "FAIL Update name blocked"

# Mutant (f): Add created_at to brand columns allow-list
run_mutant \
  "(f) add created_at to allow-list" \
  "Allow created_at updates by adding it to v_brand_columns" \
  "s/v_brand_columns text\[\] := array\['display_name', 'logo_url', 'primary_color', 'accent_color'\];/v_brand_columns text[] := array['display_name', 'logo_url', 'primary_color', 'accent_color', 'created_at'];/" \
  "FAIL Update created_at blocked"

# Mutant (g): Remove display_name length constraint
run_mutant \
  "(g) remove display_name length CHECK" \
  "Drop gyms_display_name_length constraint check" \
  "" \
  "FAIL display_name over 100 chars rejected" \
  "ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_display_name_length;"

# Mutant (h): Remove logo_url length constraint
run_mutant \
  "(h) remove logo_url length CHECK" \
  "Drop gyms_logo_url_length constraint check" \
  "" \
  "FAIL logo_url over 2048 chars rejected" \
  "ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_logo_url_length;"

# Mutants (i-k, o-r): These CHECKs live in 040, so build loosenings from 040's real text
# (i): Allow 3-digit hex (#RGB) in primary_color TABLE CHECK
run_mutant \
  "(i) allow #RGB in TABLE CHECK" \
  "Change gyms table primary_color CHECK to allow 3-digit hex (040 constraint)" \
  "" \
  "FAIL #RGB rejected" \
  "$(sed -n '/add constraint gyms_primary_color_hex/,/);/p' supabase/migrations/20261025000040_gym_branding.sql | sed 's/{6}/{3,6}/' | sed '1s/^/ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_primary_color_hex;\n/')"

# (j): TABLE CHECK Unanchored primary_color end
run_mutant \
  "(j) unanchored primary_color end in TABLE CHECK" \
  "Remove \$ anchor from primary_color CHECK (040 constraint)" \
  "" \
  "FAIL Primary hex with trailing rejected" \
  "$(sed -n '/add constraint gyms_primary_color_hex/,/);/p' supabase/migrations/20261025000040_gym_branding.sql | sed 's/{6}\$'\''/{6}'\''/' | sed '1s/^/ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_primary_color_hex;\n/')"

# (k): TABLE CHECK Unanchored accent_color end
run_mutant \
  "(k) unanchored accent_color end in TABLE CHECK" \
  "Remove \$ anchor from accent_color CHECK (040 constraint)" \
  "" \
  "FAIL Accent hex with trailing rejected" \
  "$(sed -n '/add constraint gyms_accent_color_hex/,/);/p' supabase/migrations/20261025000040_gym_branding.sql | sed 's/{6}\$'\''/{6}'\''/' | sed '1s/^/ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_accent_color_hex;\n/')"

# Mutant (l): Drop postgres from bypass
run_mutant \
  "(l) drop postgres from bypass" \
  "Block postgres from updating protected columns" \
  "s/if current_user in ('service_role', 'postgres')/if current_user in ('service_role')/" \
  "FAIL postgres direct update works"

# Mutant (m): Compare only slug (ignores other non-brand changes)
run_mutant \
  "(m) compare only slug" \
  "Narrow comparison to only slug instead of all non-brand columns" \
  "s/v_old_filtered := to_jsonb(OLD) - v_brand_columns;/v_old_filtered := jsonb_build_object('slug', OLD.slug);/; s/v_new_filtered := to_jsonb(NEW) - v_brand_columns;/v_new_filtered := jsonb_build_object('slug', NEW.slug);/" \
  "FAIL Update name blocked"

# Mutant (n): Future column - build explicit column list via sed, then add column via undo SQL
run_mutant \
  "(n) future column blocked" \
  "Change trigger to explicit list (sed) + add temp column (undo SQL)" \
  "s/v_old_filtered := to_jsonb(OLD) - v_brand_columns;/v_old_filtered := jsonb_build_object('id', OLD.id, 'slug', OLD.slug, 'name', OLD.name, 'timezone', OLD.timezone, 'created_at', OLD.created_at);/; s/v_new_filtered := to_jsonb(NEW) - v_brand_columns;/v_new_filtered := jsonb_build_object('id', NEW.id, 'slug', NEW.slug, 'name', NEW.name, 'timezone', NEW.timezone, 'created_at', NEW.created_at);/" \
  "FAIL Future column update blocked" \
  "ALTER TABLE public.gyms ADD COLUMN IF NOT EXISTS temp_future_col text;"

# QA MED-2 mutants: Loosen 040 CHECK constraints
# Mutant (o): Unanchor logo regex start
run_mutant \
  "(o) unanchored logo start" \
  "Remove ^ anchor from logo CHECK (allows leading space, 040 constraint)" \
  "" \
  "FAIL Logo with leading space rejected" \
  "$(sed -n '/add constraint gyms_logo_url_format/,/);/p' supabase/migrations/20261025000040_gym_branding.sql | sed 's/\^https/https/; s/\^\/storage/\/storage/' | sed '1s/^/ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_logo_url_format;\n/')"

# Mutant (p): Case-insensitive logo regex
run_mutant \
  "(p) case-insensitive logo" \
  "Use ~* for logo CHECK (allows HTTPS://, 040 constraint)" \
  "" \
  "FAIL Uppercase HTTPS:// rejected" \
  "$(sed -n '/add constraint gyms_logo_url_format/,/);/p' supabase/migrations/20261025000040_gym_branding.sql | sed 's/ ~ / ~* /g' | sed '1s/^/ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_logo_url_format;\n/')"

# Mutant (q): Remove only .. path traversal checks (not control char checks)
run_mutant \
  "(q) loosen .. check" \
  "Remove .. path traversal check from logo (040 constraint)" \
  "" \
  "FAIL .. path traversal rejected" \
  "$(sed -n '/add constraint gyms_logo_url_format/,/);/p' supabase/migrations/20261025000040_gym_branding.sql | sed 's/ and logo_url !~ '\''\\.\\.'\''//g' | sed '1s/^/ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_logo_url_format;\n/')"

# Mutant (r): Remove only control character checks (not .. checks)
run_mutant \
  "(r) allow control chars" \
  "Remove control character check from logo (040 constraint)" \
  "" \
  "FAIL Newline in logo rejected" \
  "$(sed -n '/add constraint gyms_logo_url_format/,/);/p' supabase/migrations/20261025000040_gym_branding.sql | sed "s/ and logo_url !~ '\[\\\\x00-\\\\x1F\\\\x7F\]'//g" | sed '1s/^/ALTER TABLE public.gyms DROP CONSTRAINT IF EXISTS gyms_logo_url_format;\n/')"

# Reset DB after last mutant
echo
echo "Resetting database after all mutants..."
RESET_OUTPUT=$(mktemp)
if ! eval "$RESET_CMD" > "$RESET_OUTPUT" 2>&1; then
  echo "❌ Final reset failed"
  cat "$RESET_OUTPUT"
  rm -f "$RESET_OUTPUT"
  exit 1
fi
rm -f "$RESET_OUTPUT"

# Verify real 043 state: trigger exists and temp column is gone
if ! psql -tA "$SUPABASE_DB_URL" -c "SELECT 1 FROM pg_trigger WHERE tgname = 'gyms_brand_only_update'" | grep -q 1; then
  echo "❌ FAIL: gyms_brand_only_update trigger not found after reset"
  exit 1
fi

if psql -tA "$SUPABASE_DB_URL" -c "SELECT 1 FROM information_schema.columns WHERE table_name = 'gyms' AND column_name = 'temp_future_col'" | grep -q 1; then
  echo "❌ FAIL: temp_future_col column still exists after reset"
  exit 1
fi

echo "✓ Real 043 state verified"

echo
echo "=== Mutant Test Summary ==="
echo "Total mutants: $TOTAL_MUTANTS"
echo "Killed: $KILLED"
echo "Survived: ${#SURVIVORS[@]}"
echo "Skipped (failed to run or wrong assertion): $((FAILED - ${#SURVIVORS[@]}))"
echo

if [ ${#SURVIVORS[@]} -gt 0 ]; then
  echo "❌ Survivors (tests passed when they should fail):"
  printf '  - %s\n' "${SURVIVORS[@]}"
  echo
fi

if [ ${#SKIPPED[@]} -gt 0 ]; then
  echo "❌ Skipped/Wrong assertion (mutant failed for wrong reason):"
  printf '  - %s\n' "${SKIPPED[@]}"
  echo
fi

if [ $FAILED -gt 0 ]; then
  echo "❌ FAIL: $FAILED mutants not properly killed"
  exit 1
fi

echo "✅ All $TOTAL_MUTANTS mutants killed with correct assertions"
exit 0
