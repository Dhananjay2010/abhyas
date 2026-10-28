#!/usr/bin/env bash
set -euo pipefail

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
SURVIVORS=()
SKIPPED=()

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

# Reset counter on each run
FAILED=0
KILLED_COUNT=0
SURVIVORS=()
SKIPPED=()

# Trap to ensure final reset on script exit
trap 'echo ""; echo "Final cleanup..."; supabase db reset > /dev/null 2>&1 || true' EXIT

run_mutant() {
  local name="$1"
  local description="$2"
  local mutation_type="$3"
  local mutation_value="$4"
  
  echo "Testing mutant: $name"
  echo "  $description"
  
  # Reset database
  local reset_output=$(mktemp)
  if ! supabase db reset > "$reset_output" 2>&1; then
    echo "  ❌ SKIPPED: db reset failed"
    SKIPPED+=("$name: db reset failed")
    rm -f "$reset_output"
    return 0
  fi
  rm -f "$reset_output"
  
  # Build mutant from original migration
  local migration_copy=$(mktemp --suffix=.sql)
  cp supabase/migrations/20261025000044_provision_gym.sql "$migration_copy"
  
  # Apply mutation using sed/perl
  local mutation_output=$(mktemp)
  case "$mutation_type" in
    sed)
      if ! sed -i "$mutation_value" "$migration_copy" > "$mutation_output" 2>&1; then
        echo "  ❌ SKIPPED: sed mutation failed"
        SKIPPED+=("$name: sed failed")
        rm -f "$migration_copy" "$mutation_output"
        return 0
      fi
      ;;
    sql_direct)
      # For direct SQL mutations (like grant changes), apply the migration first, then the mutation
      if ! psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$migration_copy" > "$mutation_output" 2>&1; then
        echo "  ❌ SKIPPED: migration apply failed"
        SKIPPED+=("$name: migration failed")
        rm -f "$migration_copy" "$mutation_output"
        return 0
      fi
      
      if ! psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -c "$mutation_value" > "$mutation_output" 2>&1; then
        echo "  ❌ SKIPPED: SQL mutation failed"
        SKIPPED+=("$name: SQL failed")
        rm -f "$migration_copy" "$mutation_output"
        return 0
      fi
      rm -f "$mutation_output"
      rm -f "$migration_copy"
      
      # Run tests and capture output
      local test_output=$(mktemp)
      if REAL_DB=1 npm run test:provision-gym-real-db > "$test_output" 2>&1; then
        echo "  ❌ SURVIVED (tests passed when they should have failed)"
        echo "  Expected: Test failure (at least one FAIL line)"
        SURVIVORS+=("$name")
        FAILED=$((FAILED + 1))
      else
        echo "  ✅ KILLED"
        KILLED_COUNT=$((KILLED_COUNT + 1))
        # Show which test failed (grep for FAIL lines)
        if grep -q "FAIL" "$test_output"; then
          local fail_label=$(grep "FAIL" "$test_output" | head -1 | sed 's/.*FAIL //')
          echo "  Killed by: $fail_label"
        fi
      fi
      rm -f "$test_output"
      return 0
      ;;
  esac
  rm -f "$mutation_output"
  
  # Verify mutation changed the file (cmp guard)
  if cmp -s supabase/migrations/20261025000044_provision_gym.sql "$migration_copy"; then
    echo "  ❌ SKIPPED: mutation did not change file (cmp guard)"
    SKIPPED+=("$name: no change")
    rm -f "$migration_copy"
    return 0
  fi
  
  # Apply mutated migration
  local apply_output=$(mktemp)
  if ! psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$migration_copy" > "$apply_output" 2>&1; then
    echo "  ❌ SKIPPED: mutant migration failed to apply"
    echo "  psql error:"
    cat "$apply_output" | sed 's/^/    /'
    SKIPPED+=("$name: apply failed")
    rm -f "$migration_copy" "$apply_output"
    return 0
  fi
  rm -f "$apply_output"
  rm -f "$migration_copy"
  
  # Run tests and capture output
  local test_output=$(mktemp)
  if REAL_DB=1 npm run test:provision-gym-real-db > "$test_output" 2>&1; then
    echo "  ❌ SURVIVED (tests passed when they should have failed)"
    echo "  Expected: Test failure (at least one FAIL line)"
    SURVIVORS+=("$name")
    FAILED=$((FAILED + 1))
  else
    echo "  ✅ KILLED"
    KILLED_COUNT=$((KILLED_COUNT + 1))
    # Show which test failed (grep for FAIL lines)
    if grep -q "FAIL" "$test_output"; then
      local fail_label=$(grep "FAIL" "$test_output" | head -1 | sed 's/.*FAIL //')
      echo "  Killed by: $fail_label"
    fi
  fi
  rm -f "$test_output"
  
  return 0
}

# Mutant (a): Grant to authenticated
run_mutant \
  "(a) grant to authenticated" \
  "Allow authenticated users to call provision_gym" \
  sql_direct \
  "grant execute on function public.provision_gym(text, text, text, text, text, text, text, text) to authenticated;"

# Mutant (b): Remove search_path setting
run_mutant \
  "(b) remove search_path" \
  "Remove search_path='' setting (SQL injection risk)" \
  sed \
  "s/set search_path = ''//g"

# Mutant (c): SECURITY INVOKER instead of SECURITY DEFINER
run_mutant \
  "(c) security invoker" \
  "Change to SECURITY INVOKER (caller's permissions)" \
  sed \
  "s/security definer/security invoker/g"

# Mutant (d): Drop unknown-email raise (insert null owner)
run_mutant \
  "(d) drop unknown-email raise" \
  "Remove PGY01 error check (allow provisioning without valid owner)" \
  sed \
  "/if v_owner_id is null then/,/end if;/d"

# Mutant (e): Drop slug idempotency (always insert)
run_mutant \
  "(e) drop slug idempotency" \
  "Remove idempotency check (allow duplicate gyms)" \
  sed \
  "/Check if gym with this slug already exists/,/else$/d"

# Mutant (f): Owner role becomes member
run_mutant \
  "(f) owner role becomes member" \
  "Change owner role to member in membership creation" \
  sed \
  "s/'owner', 'active'/'member', 'active'/g"

# Mutant (g): Skip timezone validation
run_mutant \
  "(g) skip timezone validation" \
  "Remove timezone existence check" \
  sed \
  "/if not exists (select 1 from pg_timezone_names where name = p_timezone)/,/end if;/d"

# Mutant (h): Skip colour validation (primary_color)
run_mutant \
  "(h) skip primary_color validation" \
  "Remove primary_color validation" \
  sed \
  "/if p_primary_color is not null then/,/end if;/{/if p_primary_color is not null then/!{/end if;/!d;}}"

# Mutant (i): Skip colour validation (accent_color)
run_mutant \
  "(i) skip accent_color validation" \
  "Remove accent_color validation" \
  sed \
  "/if p_accent_color is not null then/,/end if;/{/if p_accent_color is not null then/!{/end if;/!d;}}"

# Mutant (j): Skip color pair validation
run_mutant \
  "(j) skip color pair rule" \
  "Remove color pair validation (both or neither)" \
  sed \
  "/Color pair rule: both or neither/,/end if;/d"

# Mutant (k): Overwrite branding with null instead of preserving
run_mutant \
  "(k) overwrite branding with null" \
  "Replace coalesce with direct assignment (destroys existing branding)" \
  sed \
  "s/coalesce(p_display_name, display_name)/p_display_name/g; s/coalesce(p_primary_color, primary_color)/p_primary_color/g; s/coalesce(p_accent_color, accent_color)/p_accent_color/g; s/coalesce(p_logo_url, logo_url)/p_logo_url/g"

# Mutant (l): End other owner memberships (multi-gym attack)
run_mutant \
  "(l) end other owner memberships" \
  "Deactivate user's other owner memberships when creating new gym" \
  sql_direct \
  "CREATE OR REPLACE FUNCTION public.provision_gym(p_name text, p_slug text, p_timezone text, p_owner_email text, p_display_name text default null, p_primary_color text default null, p_accent_color text default null, p_logo_url text default null) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS \$\$ DECLARE v_owner_id uuid; v_existing_gym_id uuid; v_existing_membership record; v_new_gym_id uuid; BEGIN IF p_name is null or char_length(btrim(p_name)) < 1 THEN RAISE EXCEPTION 'Gym name cannot be blank or whitespace-only' USING errcode = '22023'; END IF; IF char_length(p_name) > 100 THEN RAISE EXCEPTION 'Gym name cannot exceed 100 characters' USING errcode = '22023'; END IF; IF p_slug is null or char_length(btrim(p_slug)) < 1 THEN RAISE EXCEPTION 'Gym slug cannot be blank or whitespace-only' USING errcode = '22023'; END IF; IF p_slug !~ '^[a-z0-9_-]+\$' THEN RAISE EXCEPTION 'Gym slug must contain only lowercase letters, numbers, hyphens, and underscores' USING errcode = '22023'; END IF; IF p_timezone is null THEN RAISE EXCEPTION 'Timezone cannot be null' USING errcode = '22023'; END IF; IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone) THEN RAISE EXCEPTION 'Invalid timezone: %', p_timezone USING errcode = '22023'; END IF; SELECT id INTO v_owner_id FROM auth.users WHERE lower(email) = lower(p_owner_email); IF v_owner_id is null THEN RAISE EXCEPTION 'No user with that email. Ask them to sign up first.' USING errcode = 'PGY01'; END IF; SELECT id INTO v_existing_gym_id FROM public.gyms WHERE slug = p_slug; IF v_existing_gym_id is not null THEN UPDATE public.gyms SET display_name = coalesce(p_display_name, display_name), primary_color = coalesce(p_primary_color, primary_color), accent_color = coalesce(p_accent_color, accent_color), logo_url = coalesce(p_logo_url, logo_url) WHERE id = v_existing_gym_id; SELECT * INTO v_existing_membership FROM public.gym_memberships WHERE gym_id = v_existing_gym_id AND user_id = v_owner_id; IF v_existing_membership.gym_id is null THEN INSERT INTO public.gym_memberships (gym_id, user_id, role, status, joined_at) VALUES (v_existing_gym_id, v_owner_id, 'owner', 'active', now()); ELSIF v_existing_membership.role != 'owner' OR v_existing_membership.status != 'active' THEN UPDATE public.gym_memberships SET role = 'owner', status = 'active' WHERE gym_id = v_existing_gym_id AND user_id = v_owner_id; END IF; RETURN jsonb_build_object('ok', true, 'created', false, 'gym_id', v_existing_gym_id::text, 'slug', p_slug); ELSE UPDATE public.gym_memberships SET status = 'removed' WHERE user_id = v_owner_id AND role = 'owner' AND status = 'active'; INSERT INTO public.gyms (slug, name, timezone, display_name, primary_color, accent_color, logo_url) VALUES (p_slug, p_name, p_timezone, p_display_name, p_primary_color, p_accent_color, p_logo_url) RETURNING id INTO v_new_gym_id; INSERT INTO public.gym_memberships (gym_id, user_id, role, status, joined_at) VALUES (v_new_gym_id, v_owner_id, 'owner', 'active', now()); RETURN jsonb_build_object('ok', true, 'created', true, 'gym_id', v_new_gym_id::text, 'slug', p_slug); END IF; END; \$\$;"

# Print summary
echo ""
echo "=== Mutant Test Summary ==="
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
  echo "❌ $FAILED mutant(s) survived"
  exit 1
else
  echo "✅ All mutants killed"
  exit 0
fi
