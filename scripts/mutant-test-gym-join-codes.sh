#!/usr/bin/env bash
set -euo pipefail

# Mutant test script for gym join codes
# Tests that removing key constraints or policies causes test failures
# Uses SQL commands applied after db reset (not sed on migration files)

echo "=== Mutant Testing: Gym Join Codes ==="
echo

# Skip if REAL_DB is not set (shard environments don't have Supabase)
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

# In CI, default SUPABASE_DB_URL if not set (standard Supabase local stack)
# Outside CI, SUPABASE_DB_URL is required (enforced by guard above)
if [ "${CI:-}" = "true" ] && [ -z "${SUPABASE_DB_URL:-}" ]; then
  export SUPABASE_DB_URL="postgresql://postgres:postgres@localhost:54322/postgres"
  echo "CI: Using default SUPABASE_DB_URL: $SUPABASE_DB_URL"
  echo
fi

# Check we're in the repo root
if [ ! -f "package.json" ]; then
  echo "❌ ERROR: Must run from repo root" >&2
  exit 1
fi

# Test that Supabase is running
if ! npx supabase@2.122.0 status &>/dev/null; then
  echo "❌ Supabase not running. Start it with: npx supabase@2.122.0 start"
  exit 1
fi

FAILED=0
SURVIVORS=()
SKIPPED=()

echo "Running baseline tests..."
BASELINE_OUTPUT=$(mktemp)
# In CI with local URL, use plain reset (already linked). Outside CI or with custom URL, use --db-url.
if [ "${CI:-}" = "true" ] && [[ "$SUPABASE_DB_URL" == *"localhost:54322"* ]]; then
  if ! npx supabase@2.122.0 db reset > "$BASELINE_OUTPUT" 2>&1; then
    echo "❌ Baseline: db reset failed" >&2
    cat "$BASELINE_OUTPUT"
    rm -f "$BASELINE_OUTPUT"
    exit 1
  fi
else
  if ! npx supabase@2.122.0 db reset --db-url "$SUPABASE_DB_URL" > "$BASELINE_OUTPUT" 2>&1; then
    echo "❌ Baseline: db reset failed" >&2
    cat "$BASELINE_OUTPUT"
    rm -f "$BASELINE_OUTPUT"
    exit 1
  fi
fi

if ! REAL_DB=1 npm run test:gym-join-codes-real-db > "$BASELINE_OUTPUT" 2>&1; then
  echo "❌ Baseline tests failed. Fix the code before running mutant tests." >&2
  echo "Full baseline output:"
  cat "$BASELINE_OUTPUT"
  rm -f "$BASELINE_OUTPUT"
  exit 1
fi
rm -f "$BASELINE_OUTPUT"

if ! REAL_DB=1 npm run test:gym-join-codes-comprehensive > "$BASELINE_OUTPUT" 2>&1; then
  echo "❌ Baseline comprehensive tests failed. Fix the code before running mutant tests." >&2
  echo "Full baseline output:"
  cat "$BASELINE_OUTPUT"
  rm -f "$BASELINE_OUTPUT"
  exit 1
fi
rm -f "$BASELINE_OUTPUT"
echo "✓ Baseline tests pass"
echo

run_mutant_migration_file() {
  local name="$1"
  local description="$2"
  local migration_file="$3"
  local sed_command="$4"
  local expected_label="$5"
  
  echo "Testing mutant: $name"
  echo "  $description"
  
  # Backup migration file
  cp "$migration_file" "$migration_file.backup"
  
  # Set trap to restore migration file on exit
  trap "mv '$migration_file.backup' '$migration_file' 2>/dev/null || true" EXIT
  
  # Apply mutation
  eval "$sed_command \"$migration_file\"" > "$migration_file.tmp"
  
  # Verify sed changed the file
  if cmp -s "$migration_file" "$migration_file.tmp"; then
    echo "  ⚠️  SKIPPED: sed did not change the file"
    SKIPPED+=("$name: sed pattern not found")
    rm -f "$migration_file.tmp"
    trap - EXIT
    mv "$migration_file.backup" "$migration_file"
    sleep 2
    return 0
  fi
  
  mv "$migration_file.tmp" "$migration_file"
  
  # Reset database (which will re-apply all migrations including mutated one)
  local reset_output=$(mktemp)
  if [ "${CI:-}" = "true" ] && [[ "$SUPABASE_DB_URL" == *"localhost:54322"* ]]; then
    if ! npx supabase@2.122.0 db reset > "$reset_output" 2>&1; then
      echo "  ❌ SKIPPED: db reset failed"
      SKIPPED+=("$name: db reset failed")
      rm -f "$reset_output"
      trap - EXIT
      mv "$migration_file.backup" "$migration_file"
      sleep 2
      return 0
    fi
  else
    if ! npx supabase@2.122.0 db reset --db-url "$SUPABASE_DB_URL" > "$reset_output" 2>&1; then
      echo "  ❌ SKIPPED: db reset failed"
      SKIPPED+=("$name: db reset failed")
      rm -f "$reset_output"
      trap - EXIT
      mv "$migration_file.backup" "$migration_file"
      sleep 2
      return 0
    fi
  fi
  rm -f "$reset_output"
  
  # Run tests and capture output
  local test_output=$(mktemp)
  local test1_passed=false
  local test2_passed=false
  
  if REAL_DB=1 npm run test:gym-join-codes-real-db > "$test_output" 2>&1; then
    test1_passed=true
  fi
  
  if REAL_DB=1 npm run test:gym-join-codes-comprehensive >> "$test_output" 2>&1; then
    test2_passed=true
  fi
  
  # Restore migration file and reset DB to clean state
  trap - EXIT
  mv "$migration_file.backup" "$migration_file"
  
  # Reset DB again so later steps see the real migration 042
  if [ "${CI:-}" = "true" ] && [[ "$SUPABASE_DB_URL" == *"localhost:54322"* ]]; then
    npx supabase@2.122.0 db reset > /dev/null 2>&1 || { echo "❌ Post-mutant reset failed"; exit 1; }
  else
    npx supabase@2.122.0 db reset --db-url "$SUPABASE_DB_URL" > /dev/null 2>&1 || { echo "❌ Post-mutant reset failed"; exit 1; }
  fi
  
  if [ "$test1_passed" = true ] && [ "$test2_passed" = true ]; then
    echo "  ❌ SURVIVED (both tests passed when they should have failed)"
    echo "  Last 20 lines of test output:"
    tail -20 "$test_output" | sed 's/^/    /'
    FAILED=$((FAILED + 1))
    SURVIVORS+=("$name")
  else
    # Check if expected label appears as "FAIL <label>"
    if grep -q "FAIL $expected_label" "$test_output"; then
      echo "  ✓ KILLED (test caught the mutation: FAIL $expected_label)"
    else
      echo "  ❌ SURVIVED (test failed but not with expected FAIL label)"
      echo "  Expected: FAIL $expected_label"
      echo "  Last 20 lines of test output:"
      tail -20 "$test_output" | sed 's/^/    /'
      FAILED=$((FAILED + 1))
      SURVIVORS+=("$name")
    fi
  fi
  
  rm -f "$test_output"
  echo
  sleep 2
}

run_mutant() {
  local name="$1"
  local description="$2"
  local sql_mutation="$3"
  
  echo "Testing mutant: $name"
  echo "  $description"
  
  # Reset database
  local reset_output=$(mktemp)
  # In CI with local URL, use plain reset. Outside CI or with custom URL, use --db-url.
  if [ "${CI:-}" = "true" ] && [[ "$SUPABASE_DB_URL" == *"localhost:54322"* ]]; then
    if ! npx supabase@2.122.0 db reset > "$reset_output" 2>&1; then
      echo "  ❌ SKIPPED: db reset failed"
      SKIPPED+=("$name: db reset failed")
      rm -f "$reset_output"
      sleep 2
      return 0
    fi
  else
    if ! npx supabase@2.122.0 db reset --db-url "$SUPABASE_DB_URL" > "$reset_output" 2>&1; then
      echo "  ❌ SKIPPED: db reset failed"
      SKIPPED+=("$name: db reset failed")
      rm -f "$reset_output"
      sleep 2
      return 0
    fi
  fi
  rm -f "$reset_output"
  
  # Apply mutation via psql
  local mutation_output=$(mktemp)
  if ! psql "${SUPABASE_DB_URL:-postgresql://postgres:postgres@localhost:54322/postgres}" \
    -c "$sql_mutation" > "$mutation_output" 2>&1; then
    echo "  ❌ SKIPPED: mutation SQL failed"
    cat "$mutation_output" | head -10 | sed 's/^/    /'
    SKIPPED+=("$name: mutation failed")
    rm -f "$mutation_output"
    sleep 2
    return 0
  fi
  rm -f "$mutation_output"
  
  # Run both tests and capture output
  local test_output=$(mktemp)
  local test1_passed=false
  local test2_passed=false
  
  if REAL_DB=1 npm run test:gym-join-codes-real-db > "$test_output" 2>&1; then
    test1_passed=true
  fi
  
  if REAL_DB=1 npm run test:gym-join-codes-comprehensive >> "$test_output" 2>&1; then
    test2_passed=true
  fi
  
  if [ "$test1_passed" = true ] && [ "$test2_passed" = true ]; then
    echo "  ❌ SURVIVED (both tests passed when they should have failed)"
    echo "  Last 20 lines of test output:"
    tail -20 "$test_output" | sed 's/^/    /'
    SURVIVORS+=("$name")
    FAILED=$((FAILED + 1))
  else
    echo "  ✅ KILLED"
    if grep -q "FAIL" "$test_output"; then
      echo "  Failed assertion:"
      grep "FAIL" "$test_output" | head -3 | sed 's/^/    /'
    fi
  fi
  rm -f "$test_output"
  
  sleep 2
  return 0
}

# Mutant (a): Drop FOR UPDATE (race condition)
run_mutant_migration_file \
  "(a) drop FOR UPDATE in redeem_join_code" \
  "Remove row lock that prevents race on max_uses" \
  "supabase/migrations/20261025000042_gym_join_codes_perf.sql" \
  "sed -e '/^    for update;$/d' -e '/where upper(public.gym_join_codes.code) = upper(p_code)$/s/$/;/'" \
  "redeem_join_code locks code row FOR UPDATE"

# Mutant (b): Skip use_count check
run_mutant_migration_file \
  "(b) skip use_count check" \
  "Remove max_uses exhaustion check" \
  "supabase/migrations/20261025000042_gym_join_codes_perf.sql" \
  "sed '/-- Validate not exhausted/,/end if;/{ /-- Validate not exhausted/d; /if v_code_record.max_uses is not null/d; /perform public.record_join_code_miss/d; /return jsonb_build_object.*exhausted/d; /end if;/d; }'" \
  "Exhausted code returns reason:exhausted"

# Mutant (c): Delete instead of status='removed'
run_mutant_migration_file \
  "(c) delete instead of status=removed" \
  "Delete old membership instead of setting status=removed" \
  "supabase/migrations/20261025000042_gym_join_codes_perf.sql" \
  "perl -0pe \"s/update public\\.gym_memberships\\n    set status = 'removed'/delete from public.gym_memberships/\"" \
  "Member C default gym membership still exists (not deleted)"

# Mutant (d): Skip expiry check
run_mutant_migration_file \
  "(d) skip expiry check" \
  "Allow redemption of expired codes" \
  "supabase/migrations/20261025000042_gym_join_codes_perf.sql" \
  "sed '/-- Validate not expired/,/end if;/{ /-- Validate not expired/d; /if v_code_record.expires_at is not null/d; /perform public.record_join_code_miss/d; /return jsonb_build_object.*expired/d; /end if;/d; }'" \
  "Redeem expired code returns reason:expired"

# Mutant (e): Grant to anon
run_mutant \
  "(e) grant functions to anon" \
  "Allow unauthenticated users to redeem codes" \
  "GRANT EXECUTE ON FUNCTION public.redeem_join_code(text) TO anon;"

# Mutant (f): Drop format CHECK constraint
run_mutant \
  "(f) drop code format CHECK" \
  "Allow invalid code formats (not 10 chars from unambiguous alphabet)" \
  "ALTER TABLE public.gym_join_codes DROP CONSTRAINT IF EXISTS code_format;"

# Mutant (g): Weaken inline throttle threshold from 10 to 20
run_mutant_migration_file \
  "(g) weaken inline throttle threshold to 20" \
  "Allow 20 misses instead of 10 in redeem_join_code" \
  "supabase/migrations/20261025000042_gym_join_codes_perf.sql" \
  "sed 's/>= 10/>= 20/g'" \
  "11th attempt is throttled"

# Mutant (h): Throttle counts successes too (should only count misses)
run_mutant_migration_file \
  "(h) throttle counts successes too" \
  "Record successful attempts in throttle (should only count misses)" \
  "supabase/migrations/20261025000042_gym_join_codes_perf.sql" \
  "sed '/-- Return success/i\\  perform public.record_join_code_miss(v_caller_id);'" \
  "Successes don't record attempts"

# Mutant (i): Re-add owner INSERT policy
run_mutant \
  "(i) re-add owner INSERT policy" \
  "Allow direct INSERT bypassing create_join_code RPC" \
  "CREATE POLICY gym_join_codes_owner_insert ON public.gym_join_codes FOR INSERT TO authenticated WITH CHECK (public.is_gym_owner(gym_id));"

# Mutant (j): Re-add owner UPDATE policy
run_mutant \
  "(j) re-add owner UPDATE policy" \
  "Allow direct UPDATE bypassing revoke_join_code RPC" \
  "CREATE POLICY gym_join_codes_owner_update ON public.gym_join_codes FOR UPDATE TO authenticated USING (public.is_gym_owner(gym_id)) WITH CHECK (public.is_gym_owner(gym_id));"

# Mutant (k): Replace gen_random_bytes with random() in generate_join_code
run_mutant \
  "(k) replace gen_random_bytes with random()" \
  "Use random() instead of gen_random_bytes (weaker entropy)" \
  "DROP FUNCTION IF EXISTS public.generate_join_code(); CREATE FUNCTION public.generate_join_code() RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS \$\$ DECLARE alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; alphabet_len int := 32; code_length int := 10; result text := ''; i int; byte_val int; BEGIN FOR i IN 1..code_length LOOP byte_val := floor(random() * alphabet_len)::int; result := result || substr(alphabet, byte_val + 1, 1); END LOOP; RETURN result; END; \$\$; REVOKE EXECUTE ON FUNCTION public.generate_join_code() FROM public, anon, authenticated; GRANT EXECUTE ON FUNCTION public.generate_join_code() TO postgres, service_role;"

# Mutant (l): Member upgrade to staff doesn't change role
run_mutant_migration_file \
  "(l) member upgrade to staff doesn't change role" \
  "Member upgrade to staff returns ok but doesn't actually change role" \
  "supabase/migrations/20261025000042_gym_join_codes_perf.sql" \
  "sed '/^      role = v_code_record.role,$/d'" \
  "Member upgraded to staff"

# Mutant (m): Broaden merged SELECT policy to allow anyone to read codes
run_mutant \
  "(m) broaden SELECT policy to allow any authenticated user" \
  "Remove owner/staff restrictions from merged SELECT policy" \
  "DROP POLICY IF EXISTS gym_join_codes_select ON public.gym_join_codes; CREATE POLICY gym_join_codes_select ON public.gym_join_codes FOR SELECT TO authenticated USING (true);"

# Mutant (n): Staff can see staff codes (drop role = 'member' restriction)
run_mutant \
  "(n) staff can see staff codes" \
  "Allow staff to see both member and staff codes" \
  "DROP POLICY IF EXISTS gym_join_codes_select ON public.gym_join_codes; CREATE POLICY gym_join_codes_select ON public.gym_join_codes FOR SELECT TO authenticated USING ((SELECT public.is_gym_owner(gym_id)) OR (SELECT public.is_gym_staff(gym_id)));"

# Mutant (o): Remove gym_name from already_member returns in migration 042
run_mutant_migration_file \
  "(o) already_member returns no gym_name" \
  "Remove gym_name from already_member jsonb_build_object calls" \
  "supabase/migrations/20261025000042_gym_join_codes_perf.sql" \
  "sed \"/already_member/s/, 'gym_name', v_code_record.gym_name//\"" \
  "successUser redeem already_member includes gym_name"

echo
echo "========================================="
echo "Mutant Test Summary"
echo "========================================="
TOTAL_MUTANTS=15
echo "Total mutants:                   $TOTAL_MUTANTS"
echo "Killed:                          $((TOTAL_MUTANTS - FAILED - ${#SKIPPED[@]}))"
echo "Survived:                        $FAILED"
echo "Skipped:                         ${#SKIPPED[@]}"
echo "========================================="
echo

if [ ${#SURVIVORS[@]} -gt 0 ]; then
  echo "Survivors:"
  for s in "${SURVIVORS[@]}"; do
    echo "  - $s"
  done
  echo
fi

if [ ${#SKIPPED[@]} -gt 0 ]; then
  echo "Skipped:"
  for s in "${SKIPPED[@]}"; do
    echo "  - $s"
  done
  echo
fi

if [ $FAILED -gt 0 ]; then
  echo "❌ FAIL: $FAILED survivor(s), ${#SKIPPED[@]} skip(s)"
  exit 1
fi

if [ ${#SKIPPED[@]} -gt 0 ]; then
  echo "❌ FAIL: 0 survivor(s), ${#SKIPPED[@]} skip(s)"
  exit 1
fi

echo "✅ All mutants killed"
exit 0
