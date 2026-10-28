#!/usr/bin/env bash
set -uo pipefail

# Mutant test script for provision_gym RPC
# Tests that removing key constraints or validations causes test failures

echo "=== Mutant Testing: provision_gym RPC ==="
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
  echo "CI: Using default SUPABASE_DB_URL: $SUPABASE_DB_URL"
  echo
fi

# Check we're in the repo root
if [ ! -f "package.json" ]; then
  echo "❌ ERROR: Must run from repo root" >&2
  exit 1
fi

# Test that Supabase is running
if ! supabase status &>/dev/null; then
  echo "❌ Supabase not running. Start it with: supabase start"
  exit 1
fi

FAILED=0
KILLED_COUNT=0
declare -a SURVIVORS
declare -a SKIPPED
declare -a MUTANT_RESULTS

echo "Running baseline tests..."
BASELINE_OUTPUT=$(mktemp)
if ! supabase db reset > "$BASELINE_OUTPUT" 2>&1; then
  echo "❌ Baseline: db reset failed" >&2
  cat "$BASELINE_OUTPUT"
  rm -f "$BASELINE_OUTPUT"
  exit 1
fi

if ! REAL_DB=1 npm run test:provision-gym-real-db > "$BASELINE_OUTPUT" 2>&1; then
  echo "❌ Baseline tests failed. Fix the code before running mutant tests." >&2
  echo "Full baseline output:"
  cat "$BASELINE_OUTPUT"
  rm -f "$BASELINE_OUTPUT"
  exit 1
fi
rm -f "$BASELINE_OUTPUT"
echo "✓ Baseline tests pass"
echo

# Trap to ensure final reset on script exit
trap 'echo ""; echo "Final cleanup..."; supabase db reset > /dev/null 2>&1 || true; print_summary' EXIT

print_summary() {
  echo ""
  echo "=== Mutant Test Summary ==="
  printf "%-40s %-30s %s\n" "Mutant" "Expected Label" "Result"
  printf "%-40s %-30s %s\n" "------" "--------------" "------"
  for result in "${MUTANT_RESULTS[@]}"; do
    echo "$result"
  done
  
  echo ""
  echo "Killed:   $KILLED_COUNT"
  echo "Survived: ${#SURVIVORS[@]}"
  echo "Skipped:  ${#SKIPPED[@]}"

  if [ ${#SURVIVORS[@]} -gt 0 ]; then
    echo ""
    echo "❌ Survived mutants:"
    for mutant in "${SURVIVORS[@]}"; do
      echo "  - $mutant"
    done
  fi

  if [ ${#SKIPPED[@]} -gt 0 ]; then
    echo ""
    echo "⚠️  Skipped mutants:"
    for mutant in "${SKIPPED[@]}"; do
      echo "  - $mutant"
    done
  fi

  echo ""
  if [ $FAILED -gt 0 ]; then
    echo "❌ $FAILED mutant(s) survived or were skipped"
    exit 1
  else
    echo "✅ All mutants killed"
    exit 0
  fi
}

run_mutant() {
  local name="$1"
  local description="$2"
  local expected_label="$3"
  local mutation_cmd="$4"
  
  echo "Testing mutant: $name"
  echo "  $description"
  echo "  Expected FAIL: $expected_label"
  
  # Reset database
  local reset_output=$(mktemp)
  if ! supabase db reset > "$reset_output" 2>&1; then
    echo "  ❌ SKIPPED: db reset failed"
    SKIPPED+=("$name")
    FAILED=$((FAILED + 1))
    MUTANT_RESULTS+=("$(printf "%-40s %-30s %s" "$name" "$expected_label" "SKIPPED (reset)")")
    rm -f "$reset_output"
    return 0
  fi
  rm -f "$reset_output"
  
  # Build mutant from original migration
  local migration_copy=$(mktemp --suffix=.sql)
  cp supabase/migrations/20261025000044_provision_gym.sql "$migration_copy"
  
  # Apply mutation
  local mutation_output=$(mktemp)
  if ! eval "$mutation_cmd" > "$mutation_output" 2>&1; then
    echo "  ❌ SKIPPED: mutation failed"
    echo "  Mutation error:"
    cat "$mutation_output" | sed 's/^/    /'
    SKIPPED+=("$name")
    FAILED=$((FAILED + 1))
    MUTANT_RESULTS+=("$(printf "%-40s %-30s %s" "$name" "$expected_label" "SKIPPED (mutation)")")
    rm -f "$migration_copy" "$mutation_output"
    return 0
  fi
  rm -f "$mutation_output"
  
  # Verify mutation changed the file (cmp guard)
  if cmp -s supabase/migrations/20261025000044_provision_gym.sql "$migration_copy"; then
    echo "  ❌ SKIPPED: mutation did not change file (cmp guard)"
    SKIPPED+=("$name")
    FAILED=$((FAILED + 1))
    MUTANT_RESULTS+=("$(printf "%-40s %-30s %s" "$name" "$expected_label" "SKIPPED (no change)")")
    rm -f "$migration_copy"
    return 0
  fi
  
  # Apply mutated migration
  local apply_output=$(mktemp)
  if ! psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$migration_copy" > "$apply_output" 2>&1; then
    echo "  ❌ SKIPPED: mutant migration failed to apply"
    echo "  psql error:"
    cat "$apply_output" | sed 's/^/    /'
    SKIPPED+=("$name")
    FAILED=$((FAILED + 1))
    MUTANT_RESULTS+=("$(printf "%-40s %-30s %s" "$name" "$expected_label" "SKIPPED (apply)")")
    rm -f "$migration_copy" "$apply_output"
    return 0
  fi
  rm -f "$apply_output"
  rm -f "$migration_copy"
  
  # Run tests and capture output
  local test_output=$(mktemp)
  if REAL_DB=1 npm run test:provision-gym-real-db > "$test_output" 2>&1; then
    echo "  ❌ SURVIVED (tests passed when they should have failed)"
    SURVIVORS+=("$name")
    FAILED=$((FAILED + 1))
    MUTANT_RESULTS+=("$(printf "%-40s %-30s %s" "$name" "$expected_label" "SURVIVED")")
  else
    # Check for exact FAIL label
    if grep -q "^  FAIL $expected_label" "$test_output"; then
      echo "  ✅ KILLED by: $expected_label"
      KILLED_COUNT=$((KILLED_COUNT + 1))
      MUTANT_RESULTS+=("$(printf "%-40s %-30s %s" "$name" "$expected_label" "KILLED")")
    else
      echo "  ❌ FAILED but wrong label (expected: $expected_label)"
      echo "  FAIL lines found:"
      grep "^  FAIL " "$test_output" | head -3 | sed 's/^/    /'
      SKIPPED+=("$name")
      FAILED=$((FAILED + 1))
      MUTANT_RESULTS+=("$(printf "%-40s %-30s %s" "$name" "$expected_label" "WRONG LABEL")")
    fi
  fi
  rm -f "$test_output"
  
  return 0
}

# Mutant (a): Grant to authenticated
run_mutant \
  "(a) grant to authenticated" \
  "Allow authenticated users to call provision_gym" \
  "authenticated call is denied" \
  "echo 'grant execute on function public.provision_gym(text, text, text, text, text, text, text, text) to authenticated;' >> \"$migration_copy\""

# Mutant (b): Remove search_path setting
run_mutant \
  "(b) remove search_path" \
  "Remove search_path='' setting (SQL injection risk)" \
  "proconfig contains search_path" \
  "sed -i 's/set search_path = .\{1,\}//' \"$migration_copy\""

# Mutant (c): SECURITY INVOKER instead of SECURITY DEFINER
run_mutant \
  "(c) security invoker" \
  "Change to SECURITY INVOKER (caller's permissions)" \
  "authenticated call is denied" \
  "sed -i 's/security definer/security invoker/g' \"$migration_copy\""

# Mutant (d): Drop unknown-email raise (insert null owner)
run_mutant \
  "(d) drop unknown-email raise" \
  "Remove PGY01 error check (allow provisioning without valid owner)" \
  "error code is PGY01" \
  "sed -i '/if v_owner_id is null then/,/end if;/{ /if v_owner_id is null then/!{ /end if;/!d; }; }' \"$migration_copy\""

# Mutant (e): Drop slug idempotency (always insert)
run_mutant \
  "(e) drop slug idempotency" \
  "Remove idempotency check (allow duplicate gyms)" \
  "no duplicate gym rows" \
  "sed -i 's/if v_existing_gym_id is not null then/if false then/' \"$migration_copy\""

# Mutant (f): Owner role becomes member
run_mutant \
  "(f) owner role becomes member" \
  "Change owner role to member in membership creation" \
  "membership role is owner" \
  "sed -i \"s/'owner', 'active'/'member', 'active'/g\" \"$migration_copy\""

# Mutant (g): Skip timezone validation
run_mutant \
  "(g) skip timezone validation" \
  "Remove timezone existence check" \
  "error code is 22023" \
  "sed -i '/if not exists (select 1 from pg_timezone_names where name = p_timezone)/,/end if;/{ /if not exists/!{ /end if;/!d; }; }' \"$migration_copy\""

# Mutant (h): Skip colour validation (primary_color)
run_mutant \
  "(h) skip primary_color validation" \
  "Remove primary_color validation" \
  "error code is BRND2" \
  "sed -i \"s/if p_primary_color !~ '\^#\[0-9A-Fa-f\]{6}\\\$' then/if false then/\" \"$migration_copy\""

# Mutant (i): Skip colour validation (accent_color)
run_mutant \
  "(i) skip accent_color validation" \
  "Remove accent_color validation" \
  "error code is BRND3" \
  "sed -i \"s/if p_accent_color !~ '\^#\[0-9A-Fa-f\]{6}\\\$' then/if false then/\" \"$migration_copy\""

# Mutant (j): Skip color pair validation
run_mutant \
  "(j) skip color pair rule" \
  "Remove color pair validation (both or neither)" \
  "error code is BRND7" \
  "sed -i '/Color pair rule: both or neither/,/^  end if;$/d' \"$migration_copy\""

# Mutant (k): Overwrite branding with null instead of preserving
run_mutant \
  "(k) overwrite branding with null" \
  "Replace coalesce with direct assignment (destroys existing branding)" \
  "display_name unchanged" \
  "sed -i 's/coalesce(p_display_name, display_name)/p_display_name/g; s/coalesce(p_primary_color, primary_color)/p_primary_color/g; s/coalesce(p_accent_color, accent_color)/p_accent_color/g; s/coalesce(p_logo_url, logo_url)/p_logo_url/g' \"$migration_copy\""

# Mutant (l): End other owner memberships (multi-gym attack)
run_mutant \
  "(l) end other owner memberships" \
  "Deactivate user's other owner memberships when creating new gym" \
  "gym A membership unchanged" \
  "perl -i -pe 's/(insert into public\.gyms.*RETURNING id INTO v_new_gym_id;)/UPDATE public.gym_memberships SET status=\x27removed\x27 WHERE user_id=v_owner_id AND role=\x27owner\x27 AND status=\x27active\x27;\n      \$1/' \"$migration_copy\""

# Mutant (m): Drop PGY03 check (different owner)
run_mutant \
  "(m) drop PGY03 check" \
  "Allow re-provisioning with different owner (23505)" \
  "error code is PGY03" \
  "sed -i '/if exists (/,/end if;$/{ /Gym exists: check if trying to assign a different owner/,/end if;$/d; }' \"$migration_copy\""

# Summary is printed by trap on exit
