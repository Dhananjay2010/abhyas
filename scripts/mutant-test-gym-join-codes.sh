#!/usr/bin/env bash
set -euo pipefail

# Mutant test script for gym join codes
# Tests that removing key constraints or policies causes test failures
# Uses SQL commands applied after db reset (not sed on migration files)

echo "=== Mutant Testing: Gym Join Codes ==="
echo

# Source shared guard
source "$(dirname "$0")/lib-db-reset-guard.sh"

# Check guard
if ! check_db_reset_guard_bash check; then
  check_db_reset_guard_bash explain
  exit 1
fi

# CI can default DB URL
if [ -z "${SUPABASE_DB_URL:-}" ] && [ "${CI:-}" = "true" ]; then
  export SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
fi

# Skip if REAL_DB is not set (shard environments don't have Supabase)
if [ "${REAL_DB:-}" != "1" ]; then
  echo "⏭️  Skipping mutant tests (REAL_DB=1 not set)"
  echo "   Set REAL_DB=1 to run these tests against a local Supabase instance"
  echo
  exit 0
fi

# Check we're in the repo root
if [ ! -f "package.json" ]; then
  echo "❌ ERROR: Must run from repo root" >&2
  exit 1
fi

# Test that Supabase is running
if ! npx supabase@latest status &>/dev/null; then
  echo "❌ Supabase not running. Start it with: npx supabase@latest start"
  exit 1
fi

FAILED=0
SURVIVORS=()
SKIPPED=()

echo "Running baseline tests..."
BASELINE_OUTPUT=$(mktemp)
if ! npx supabase@latest db reset > "$BASELINE_OUTPUT" 2>&1; then
  echo "❌ Baseline: db reset failed" >&2
  cat "$BASELINE_OUTPUT"
  rm -f "$BASELINE_OUTPUT"
  exit 1
fi

if ! REAL_DB=1 npm run test:gym-join-codes-real-db > "$BASELINE_OUTPUT" 2>&1; then
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
  local sql_mutation="$3"
  
  echo "Testing mutant: $name"
  echo "  $description"
  
  # Reset database
  local reset_output=$(mktemp)
  if ! npx supabase@latest db reset > "$reset_output" 2>&1; then
    echo "  ❌ SKIPPED: db reset failed"
    SKIPPED+=("$name: db reset failed")
    rm -f "$reset_output"
    sleep 2
    return 0
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
  
  # Run tests and capture output
  local test_output=$(mktemp)
  if REAL_DB=1 npm run test:gym-join-codes-real-db > "$test_output" 2>&1; then
    echo "  ❌ SURVIVED (tests passed when they should have failed)"
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
run_mutant \
  "(a) drop FOR UPDATE in redeem_join_code" \
  "Remove row lock that prevents race on max_uses" \
  "CREATE OR REPLACE FUNCTION public.redeem_join_code(p_code text) RETURNS TABLE(gym_id uuid, gym_name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS \$\$ DECLARE v_code_record record; v_caller_id uuid; v_existing_membership record; BEGIN v_caller_id := auth.uid(); IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING errcode = 'GJC00'; END IF; PERFORM public.check_join_code_throttle(v_caller_id); BEGIN SELECT public.gym_join_codes.id, public.gym_join_codes.gym_id, public.gym_join_codes.role, public.gym_join_codes.use_count, public.gym_join_codes.max_uses, public.gym_join_codes.expires_at, public.gym_join_codes.revoked_at, public.gyms.name AS gym_name INTO STRICT v_code_record FROM public.gym_join_codes JOIN public.gyms ON public.gym_join_codes.gym_id = public.gyms.id WHERE upper(public.gym_join_codes.code) = upper(p_code); EXCEPTION WHEN no_data_found THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; WHEN too_many_rows THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; END; IF v_code_record.revoked_at IS NOT NULL THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; END IF; IF v_code_record.expires_at IS NOT NULL AND v_code_record.expires_at <= now() THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; END IF; IF v_code_record.max_uses IS NOT NULL AND v_code_record.use_count >= v_code_record.max_uses THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; END IF; SELECT * INTO v_existing_membership FROM public.gym_memberships WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; IF v_existing_membership.gym_id IS NOT NULL AND v_existing_membership.status = 'active' THEN RETURN QUERY SELECT v_code_record.gym_id, v_code_record.gym_name; RETURN; END IF; IF v_code_record.role = 'member' THEN UPDATE public.gym_memberships SET status = 'removed' WHERE public.gym_memberships.user_id = v_caller_id AND public.gym_memberships.role = 'member' AND public.gym_memberships.status = 'active' AND public.gym_memberships.gym_id != v_code_record.gym_id; END IF; IF v_existing_membership.gym_id IS NULL THEN INSERT INTO public.gym_memberships (gym_id, user_id, role, status, joined_at) VALUES (v_code_record.gym_id, v_caller_id, v_code_record.role, 'active', now()); ELSE UPDATE public.gym_memberships SET role = v_code_record.role, status = 'active', joined_at = CASE WHEN public.gym_memberships.status = 'removed' THEN now() ELSE public.gym_memberships.joined_at END WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; END IF; UPDATE public.gym_join_codes SET use_count = use_count + 1 WHERE id = v_code_record.id; RETURN QUERY SELECT v_code_record.gym_id, v_code_record.gym_name; END; \$\$;"

# Mutant (b): Skip use_count check
run_mutant \
  "(b) skip use_count check" \
  "Remove max_uses exhaustion check" \
  "CREATE OR REPLACE FUNCTION public.redeem_join_code(p_code text) RETURNS TABLE(gym_id uuid, gym_name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS \$\$ DECLARE v_code_record record; v_caller_id uuid; v_existing_membership record; BEGIN v_caller_id := auth.uid(); IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING errcode = 'GJC00'; END IF; PERFORM public.check_join_code_throttle(v_caller_id); BEGIN SELECT public.gym_join_codes.id, public.gym_join_codes.gym_id, public.gym_join_codes.role, public.gym_join_codes.use_count, public.gym_join_codes.max_uses, public.gym_join_codes.expires_at, public.gym_join_codes.revoked_at, public.gyms.name AS gym_name INTO STRICT v_code_record FROM public.gym_join_codes JOIN public.gyms ON public.gym_join_codes.gym_id = public.gyms.id WHERE upper(public.gym_join_codes.code) = upper(p_code) FOR UPDATE; EXCEPTION WHEN no_data_found THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; WHEN too_many_rows THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; END; IF v_code_record.revoked_at IS NOT NULL THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; END IF; IF v_code_record.expires_at IS NOT NULL AND v_code_record.expires_at <= now() THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; END IF; SELECT * INTO v_existing_membership FROM public.gym_memberships WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; IF v_existing_membership.gym_id IS NOT NULL AND v_existing_membership.status = 'active' THEN RETURN QUERY SELECT v_code_record.gym_id, v_code_record.gym_name; RETURN; END IF; IF v_code_record.role = 'member' THEN UPDATE public.gym_memberships SET status = 'removed' WHERE public.gym_memberships.user_id = v_caller_id AND public.gym_memberships.role = 'member' AND public.gym_memberships.status = 'active' AND public.gym_memberships.gym_id != v_code_record.gym_id; END IF; IF v_existing_membership.gym_id IS NULL THEN INSERT INTO public.gym_memberships (gym_id, user_id, role, status, joined_at) VALUES (v_code_record.gym_id, v_caller_id, v_code_record.role, 'active', now()); ELSE UPDATE public.gym_memberships SET role = v_code_record.role, status = 'active', joined_at = CASE WHEN public.gym_memberships.status = 'removed' THEN now() ELSE public.gym_memberships.joined_at END WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; END IF; UPDATE public.gym_join_codes SET use_count = use_count + 1 WHERE id = v_code_record.id; RETURN QUERY SELECT v_code_record.gym_id, v_code_record.gym_name; END; \$\$;"

# Mutant (c): Delete instead of status='removed'
run_mutant \
  "(c) delete instead of status=removed" \
  "Delete old membership instead of setting status=removed" \
  "CREATE OR REPLACE FUNCTION public.redeem_join_code(p_code text) RETURNS TABLE(gym_id uuid, gym_name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS \$\$ DECLARE v_code_record record; v_caller_id uuid; v_existing_membership record; BEGIN v_caller_id := auth.uid(); IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING errcode = 'GJC00'; END IF; PERFORM public.check_join_code_throttle(v_caller_id); BEGIN SELECT public.gym_join_codes.id, public.gym_join_codes.gym_id, public.gym_join_codes.role, public.gym_join_codes.use_count, public.gym_join_codes.max_uses, public.gym_join_codes.expires_at, public.gym_join_codes.revoked_at, public.gyms.name AS gym_name INTO STRICT v_code_record FROM public.gym_join_codes JOIN public.gyms ON public.gym_join_codes.gym_id = public.gyms.id WHERE upper(public.gym_join_codes.code) = upper(p_code) FOR UPDATE; EXCEPTION WHEN no_data_found THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; WHEN too_many_rows THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; END; IF v_code_record.revoked_at IS NOT NULL THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; END IF; IF v_code_record.expires_at IS NOT NULL AND v_code_record.expires_at <= now() THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; END IF; IF v_code_record.max_uses IS NOT NULL AND v_code_record.use_count >= v_code_record.max_uses THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; END IF; SELECT * INTO v_existing_membership FROM public.gym_memberships WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; IF v_existing_membership.gym_id IS NOT NULL AND v_existing_membership.status = 'active' THEN RETURN QUERY SELECT v_code_record.gym_id, v_code_record.gym_name; RETURN; END IF; IF v_code_record.role = 'member' THEN DELETE FROM public.gym_memberships WHERE public.gym_memberships.user_id = v_caller_id AND public.gym_memberships.role = 'member' AND public.gym_memberships.status = 'active' AND public.gym_memberships.gym_id != v_code_record.gym_id; END IF; IF v_existing_membership.gym_id IS NULL THEN INSERT INTO public.gym_memberships (gym_id, user_id, role, status, joined_at) VALUES (v_code_record.gym_id, v_caller_id, v_code_record.role, 'active', now()); ELSE UPDATE public.gym_memberships SET role = v_code_record.role, status = 'active', joined_at = CASE WHEN public.gym_memberships.status = 'removed' THEN now() ELSE public.gym_memberships.joined_at END WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; END IF; UPDATE public.gym_join_codes SET use_count = use_count + 1 WHERE id = v_code_record.id; RETURN QUERY SELECT v_code_record.gym_id, v_code_record.gym_name; END; \$\$;"

# Mutant (d): Skip expiry check
run_mutant \
  "(d) skip expiry check" \
  "Allow redemption of expired codes" \
  "CREATE OR REPLACE FUNCTION public.redeem_join_code(p_code text) RETURNS TABLE(gym_id uuid, gym_name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS \$\$ DECLARE v_code_record record; v_caller_id uuid; v_existing_membership record; BEGIN v_caller_id := auth.uid(); IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING errcode = 'GJC00'; END IF; PERFORM public.check_join_code_throttle(v_caller_id); BEGIN SELECT public.gym_join_codes.id, public.gym_join_codes.gym_id, public.gym_join_codes.role, public.gym_join_codes.use_count, public.gym_join_codes.max_uses, public.gym_join_codes.expires_at, public.gym_join_codes.revoked_at, public.gyms.name AS gym_name INTO STRICT v_code_record FROM public.gym_join_codes JOIN public.gyms ON public.gym_join_codes.gym_id = public.gyms.id WHERE upper(public.gym_join_codes.code) = upper(p_code) FOR UPDATE; EXCEPTION WHEN no_data_found THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; WHEN too_many_rows THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; END; IF v_code_record.revoked_at IS NOT NULL THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; END IF; IF v_code_record.max_uses IS NOT NULL AND v_code_record.use_count >= v_code_record.max_uses THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; END IF; SELECT * INTO v_existing_membership FROM public.gym_memberships WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; IF v_existing_membership.gym_id IS NOT NULL AND v_existing_membership.status = 'active' THEN RETURN QUERY SELECT v_code_record.gym_id, v_code_record.gym_name; RETURN; END IF; IF v_code_record.role = 'member' THEN UPDATE public.gym_memberships SET status = 'removed' WHERE public.gym_memberships.user_id = v_caller_id AND public.gym_memberships.role = 'member' AND public.gym_memberships.status = 'active' AND public.gym_memberships.gym_id != v_code_record.gym_id; END IF; IF v_existing_membership.gym_id IS NULL THEN INSERT INTO public.gym_memberships (gym_id, user_id, role, status, joined_at) VALUES (v_code_record.gym_id, v_caller_id, v_code_record.role, 'active', now()); ELSE UPDATE public.gym_memberships SET role = v_code_record.role, status = 'active', joined_at = CASE WHEN public.gym_memberships.status = 'removed' THEN now() ELSE public.gym_memberships.joined_at END WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; END IF; UPDATE public.gym_join_codes SET use_count = use_count + 1 WHERE id = v_code_record.id; RETURN QUERY SELECT v_code_record.gym_id, v_code_record.gym_name; END; \$\$;"

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

# Mutant (g): Change throttle threshold from 10 to 20
run_mutant \
  "(g) weaken throttle threshold to 20" \
  "Allow 20 misses instead of 10" \
  "CREATE OR REPLACE FUNCTION public.check_join_code_throttle(p_user_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS \$\$ DECLARE v_attempt_count int; BEGIN SELECT count(*) INTO v_attempt_count FROM public.gym_join_code_attempts WHERE user_id = p_user_id AND attempted_at > now() - interval '15 minutes'; IF v_attempt_count >= 20 THEN RAISE EXCEPTION 'Too many failed attempts. Please try again later.' USING errcode = 'GJC10'; END IF; END; \$\$;"

# Mutant (h): Make throttle count ALL attempts (not just misses)
run_mutant \
  "(h) throttle counts successes too" \
  "Record successful attempts in throttle (should only count misses)" \
  "CREATE OR REPLACE FUNCTION public.redeem_join_code(p_code text) RETURNS TABLE(gym_id uuid, gym_name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS \$\$ DECLARE v_code_record record; v_caller_id uuid; v_existing_membership record; BEGIN v_caller_id := auth.uid(); IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING errcode = 'GJC00'; END IF; PERFORM public.check_join_code_throttle(v_caller_id); BEGIN SELECT public.gym_join_codes.id, public.gym_join_codes.gym_id, public.gym_join_codes.role, public.gym_join_codes.use_count, public.gym_join_codes.max_uses, public.gym_join_codes.expires_at, public.gym_join_codes.revoked_at, public.gyms.name AS gym_name INTO STRICT v_code_record FROM public.gym_join_codes JOIN public.gyms ON public.gym_join_codes.gym_id = public.gyms.id WHERE upper(public.gym_join_codes.code) = upper(p_code) FOR UPDATE; EXCEPTION WHEN no_data_found THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; WHEN too_many_rows THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; END; IF v_code_record.revoked_at IS NOT NULL THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; END IF; IF v_code_record.expires_at IS NOT NULL AND v_code_record.expires_at <= now() THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; END IF; IF v_code_record.max_uses IS NOT NULL AND v_code_record.use_count >= v_code_record.max_uses THEN PERFORM public.record_join_code_miss(v_caller_id); RAISE EXCEPTION 'Invalid code' USING errcode = 'GJC02'; END IF; SELECT * INTO v_existing_membership FROM public.gym_memberships WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; IF v_existing_membership.gym_id IS NOT NULL AND v_existing_membership.status = 'active' THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN QUERY SELECT v_code_record.gym_id, v_code_record.gym_name; RETURN; END IF; IF v_code_record.role = 'member' THEN UPDATE public.gym_memberships SET status = 'removed' WHERE public.gym_memberships.user_id = v_caller_id AND public.gym_memberships.role = 'member' AND public.gym_memberships.status = 'active' AND public.gym_memberships.gym_id != v_code_record.gym_id; END IF; IF v_existing_membership.gym_id IS NULL THEN INSERT INTO public.gym_memberships (gym_id, user_id, role, status, joined_at) VALUES (v_code_record.gym_id, v_caller_id, v_code_record.role, 'active', now()); ELSE UPDATE public.gym_memberships SET role = v_code_record.role, status = 'active', joined_at = CASE WHEN public.gym_memberships.status = 'removed' THEN now() ELSE public.gym_memberships.joined_at END WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; END IF; UPDATE public.gym_join_codes SET use_count = use_count + 1 WHERE id = v_code_record.id; PERFORM public.record_join_code_miss(v_caller_id); RETURN QUERY SELECT v_code_record.gym_id, v_code_record.gym_name; END; \$\$;"

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

echo
echo "========================================="
echo "Mutant Test Summary"
echo "========================================="
TOTAL_MUTANTS=10
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
