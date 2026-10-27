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
if ! npx supabase@2.122.0 status &>/dev/null; then
  echo "❌ Supabase not running. Start it with: npx supabase@2.122.0 start"
  exit 1
fi

FAILED=0
SURVIVORS=()
SKIPPED=()

echo "Running baseline tests..."
BASELINE_OUTPUT=$(mktemp)
if ! npx supabase@2.122.0 db reset > "$BASELINE_OUTPUT" 2>&1; then
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

run_mutant() {
  local name="$1"
  local description="$2"
  local sql_mutation="$3"
  
  echo "Testing mutant: $name"
  echo "  $description"
  
  # Reset database
  local reset_output=$(mktemp)
  if ! npx supabase@2.122.0 db reset > "$reset_output" 2>&1; then
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

# Mutant (a): Drop FOR UPDATE (race condition) - updated for jsonb return
run_mutant \
  "(a) drop FOR UPDATE in redeem_join_code" \
  "Remove row lock that prevents race on max_uses" \
  "DROP FUNCTION IF EXISTS public.redeem_join_code(text); CREATE FUNCTION public.redeem_join_code(p_code text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = '' AS \$\$ DECLARE v_code_record record; v_caller_id uuid; v_existing_membership record; v_is_read_only text; v_attempt_count int; BEGIN v_caller_id := auth.uid(); IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING errcode = 'GJC00'; END IF; v_is_read_only := current_setting('transaction_read_only'); IF v_is_read_only = 'on' THEN RAISE EXCEPTION 'Read-only access not permitted' USING errcode = 'GJC11'; END IF; SELECT count(*) INTO v_attempt_count FROM public.gym_join_code_attempts WHERE user_id = v_caller_id AND attempted_at > now() - interval '15 minutes'; IF v_attempt_count >= 10 THEN RETURN jsonb_build_object('ok', false, 'reason', 'throttled'); END IF; BEGIN SELECT public.gym_join_codes.id, public.gym_join_codes.gym_id, public.gym_join_codes.role, public.gym_join_codes.use_count, public.gym_join_codes.max_uses, public.gym_join_codes.expires_at, public.gym_join_codes.revoked_at, public.gyms.name AS gym_name INTO STRICT v_code_record FROM public.gym_join_codes JOIN public.gyms ON public.gym_join_codes.gym_id = public.gyms.id WHERE upper(public.gym_join_codes.code) = upper(p_code); EXCEPTION WHEN no_data_found THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); WHEN too_many_rows THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END; IF v_code_record.revoked_at IS NOT NULL THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'revoked'); END IF; IF v_code_record.expires_at IS NOT NULL AND v_code_record.expires_at <= now() THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'expired'); END IF; IF v_code_record.max_uses IS NOT NULL AND v_code_record.use_count >= v_code_record.max_uses THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'exhausted'); END IF; SELECT * INTO v_existing_membership FROM public.gym_memberships WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; IF v_existing_membership.gym_id IS NOT NULL AND v_existing_membership.status = 'active' THEN IF v_existing_membership.role = 'owner' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_member'); END IF; IF v_existing_membership.role = 'staff' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_member'); END IF; IF v_existing_membership.role = 'member' AND v_code_record.role = 'staff' THEN null; ELSE RETURN jsonb_build_object('ok', false, 'reason', 'already_member'); END IF; END IF; IF v_code_record.role = 'member' THEN UPDATE public.gym_memberships SET status = 'removed' WHERE public.gym_memberships.user_id = v_caller_id AND public.gym_memberships.role = 'member' AND public.gym_memberships.status = 'active' AND public.gym_memberships.gym_id != v_code_record.gym_id; END IF; IF v_existing_membership.gym_id IS NULL THEN INSERT INTO public.gym_memberships (gym_id, user_id, role, status, joined_at) VALUES (v_code_record.gym_id, v_caller_id, v_code_record.role, 'active', now()); ELSE UPDATE public.gym_memberships SET role = v_code_record.role, status = 'active', joined_at = CASE WHEN public.gym_memberships.status = 'removed' THEN now() ELSE public.gym_memberships.joined_at END WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; END IF; UPDATE public.gym_join_codes SET use_count = use_count + 1 WHERE id = v_code_record.id; RETURN jsonb_build_object('ok', true, 'gym_id', v_code_record.gym_id::text, 'gym_name', v_code_record.gym_name); END; \$\$; REVOKE EXECUTE ON FUNCTION public.redeem_join_code(text) FROM public, anon; GRANT EXECUTE ON FUNCTION public.redeem_join_code(text) TO authenticated;"

# Mutant (b): Skip use_count check - updated for jsonb return
run_mutant \
  "(b) skip use_count check" \
  "Remove max_uses exhaustion check" \
  "DROP FUNCTION IF EXISTS public.redeem_join_code(text); CREATE FUNCTION public.redeem_join_code(p_code text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = '' AS \$\$ DECLARE v_code_record record; v_caller_id uuid; v_existing_membership record; v_is_read_only text; v_attempt_count int; BEGIN v_caller_id := auth.uid(); IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING errcode = 'GJC00'; END IF; v_is_read_only := current_setting('transaction_read_only'); IF v_is_read_only = 'on' THEN RAISE EXCEPTION 'Read-only access not permitted' USING errcode = 'GJC11'; END IF; SELECT count(*) INTO v_attempt_count FROM public.gym_join_code_attempts WHERE user_id = v_caller_id AND attempted_at > now() - interval '15 minutes'; IF v_attempt_count >= 10 THEN RETURN jsonb_build_object('ok', false, 'reason', 'throttled'); END IF; BEGIN SELECT public.gym_join_codes.id, public.gym_join_codes.gym_id, public.gym_join_codes.role, public.gym_join_codes.use_count, public.gym_join_codes.max_uses, public.gym_join_codes.expires_at, public.gym_join_codes.revoked_at, public.gyms.name AS gym_name INTO STRICT v_code_record FROM public.gym_join_codes JOIN public.gyms ON public.gym_join_codes.gym_id = public.gyms.id WHERE upper(public.gym_join_codes.code) = upper(p_code) FOR UPDATE; EXCEPTION WHEN no_data_found THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); WHEN too_many_rows THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END; IF v_code_record.revoked_at IS NOT NULL THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'revoked'); END IF; IF v_code_record.expires_at IS NOT NULL AND v_code_record.expires_at <= now() THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'expired'); END IF; SELECT * INTO v_existing_membership FROM public.gym_memberships WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; IF v_existing_membership.gym_id IS NOT NULL AND v_existing_membership.status = 'active' THEN IF v_existing_membership.role = 'owner' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_member'); END IF; IF v_existing_membership.role = 'staff' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_member'); END IF; IF v_existing_membership.role = 'member' AND v_code_record.role = 'staff' THEN null; ELSE RETURN jsonb_build_object('ok', false, 'reason', 'already_member'); END IF; END IF; IF v_code_record.role = 'member' THEN UPDATE public.gym_memberships SET status = 'removed' WHERE public.gym_memberships.user_id = v_caller_id AND public.gym_memberships.role = 'member' AND public.gym_memberships.status = 'active' AND public.gym_memberships.gym_id != v_code_record.gym_id; END IF; IF v_existing_membership.gym_id IS NULL THEN INSERT INTO public.gym_memberships (gym_id, user_id, role, status, joined_at) VALUES (v_code_record.gym_id, v_caller_id, v_code_record.role, 'active', now()); ELSE UPDATE public.gym_memberships SET role = v_code_record.role, status = 'active', joined_at = CASE WHEN public.gym_memberships.status = 'removed' THEN now() ELSE public.gym_memberships.joined_at END WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; END IF; UPDATE public.gym_join_codes SET use_count = use_count + 1 WHERE id = v_code_record.id; RETURN jsonb_build_object('ok', true, 'gym_id', v_code_record.gym_id::text, 'gym_name', v_code_record.gym_name); END; \$\$; REVOKE EXECUTE ON FUNCTION public.redeem_join_code(text) FROM public, anon; GRANT EXECUTE ON FUNCTION public.redeem_join_code(text) TO authenticated;"

# Mutant (c): Delete instead of status='removed' - updated for jsonb return
run_mutant \
  "(c) delete instead of status=removed" \
  "Delete old membership instead of setting status=removed" \
  "DROP FUNCTION IF EXISTS public.redeem_join_code(text); CREATE FUNCTION public.redeem_join_code(p_code text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = '' AS \$\$ DECLARE v_code_record record; v_caller_id uuid; v_existing_membership record; v_is_read_only text; v_attempt_count int; BEGIN v_caller_id := auth.uid(); IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING errcode = 'GJC00'; END IF; v_is_read_only := current_setting('transaction_read_only'); IF v_is_read_only = 'on' THEN RAISE EXCEPTION 'Read-only access not permitted' USING errcode = 'GJC11'; END IF; SELECT count(*) INTO v_attempt_count FROM public.gym_join_code_attempts WHERE user_id = v_caller_id AND attempted_at > now() - interval '15 minutes'; IF v_attempt_count >= 10 THEN RETURN jsonb_build_object('ok', false, 'reason', 'throttled'); END IF; BEGIN SELECT public.gym_join_codes.id, public.gym_join_codes.gym_id, public.gym_join_codes.role, public.gym_join_codes.use_count, public.gym_join_codes.max_uses, public.gym_join_codes.expires_at, public.gym_join_codes.revoked_at, public.gyms.name AS gym_name INTO STRICT v_code_record FROM public.gym_join_codes JOIN public.gyms ON public.gym_join_codes.gym_id = public.gyms.id WHERE upper(public.gym_join_codes.code) = upper(p_code) FOR UPDATE; EXCEPTION WHEN no_data_found THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); WHEN too_many_rows THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END; IF v_code_record.revoked_at IS NOT NULL THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'revoked'); END IF; IF v_code_record.expires_at IS NOT NULL AND v_code_record.expires_at <= now() THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'expired'); END IF; IF v_code_record.max_uses IS NOT NULL AND v_code_record.use_count >= v_code_record.max_uses THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'exhausted'); END IF; SELECT * INTO v_existing_membership FROM public.gym_memberships WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; IF v_existing_membership.gym_id IS NOT NULL AND v_existing_membership.status = 'active' THEN IF v_existing_membership.role = 'owner' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_member'); END IF; IF v_existing_membership.role = 'staff' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_member'); END IF; IF v_existing_membership.role = 'member' AND v_code_record.role = 'staff' THEN null; ELSE RETURN jsonb_build_object('ok', false, 'reason', 'already_member'); END IF; END IF; IF v_code_record.role = 'member' THEN DELETE FROM public.gym_memberships WHERE public.gym_memberships.user_id = v_caller_id AND public.gym_memberships.role = 'member' AND public.gym_memberships.status = 'active' AND public.gym_memberships.gym_id != v_code_record.gym_id; END IF; IF v_existing_membership.gym_id IS NULL THEN INSERT INTO public.gym_memberships (gym_id, user_id, role, status, joined_at) VALUES (v_code_record.gym_id, v_caller_id, v_code_record.role, 'active', now()); ELSE UPDATE public.gym_memberships SET role = v_code_record.role, status = 'active', joined_at = CASE WHEN public.gym_memberships.status = 'removed' THEN now() ELSE public.gym_memberships.joined_at END WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; END IF; UPDATE public.gym_join_codes SET use_count = use_count + 1 WHERE id = v_code_record.id; RETURN jsonb_build_object('ok', true, 'gym_id', v_code_record.gym_id::text, 'gym_name', v_code_record.gym_name); END; \$\$; REVOKE EXECUTE ON FUNCTION public.redeem_join_code(text) FROM public, anon; GRANT EXECUTE ON FUNCTION public.redeem_join_code(text) TO authenticated;"

# Mutant (d): Skip expiry check - updated for jsonb return
run_mutant \
  "(d) skip expiry check" \
  "Allow redemption of expired codes" \
  "DROP FUNCTION IF EXISTS public.redeem_join_code(text); CREATE FUNCTION public.redeem_join_code(p_code text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = '' AS \$\$ DECLARE v_code_record record; v_caller_id uuid; v_existing_membership record; v_is_read_only text; v_attempt_count int; BEGIN v_caller_id := auth.uid(); IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING errcode = 'GJC00'; END IF; v_is_read_only := current_setting('transaction_read_only'); IF v_is_read_only = 'on' THEN RAISE EXCEPTION 'Read-only access not permitted' USING errcode = 'GJC11'; END IF; SELECT count(*) INTO v_attempt_count FROM public.gym_join_code_attempts WHERE user_id = v_caller_id AND attempted_at > now() - interval '15 minutes'; IF v_attempt_count >= 10 THEN RETURN jsonb_build_object('ok', false, 'reason', 'throttled'); END IF; BEGIN SELECT public.gym_join_codes.id, public.gym_join_codes.gym_id, public.gym_join_codes.role, public.gym_join_codes.use_count, public.gym_join_codes.max_uses, public.gym_join_codes.expires_at, public.gym_join_codes.revoked_at, public.gyms.name AS gym_name INTO STRICT v_code_record FROM public.gym_join_codes JOIN public.gyms ON public.gym_join_codes.gym_id = public.gyms.id WHERE upper(public.gym_join_codes.code) = upper(p_code) FOR UPDATE; EXCEPTION WHEN no_data_found THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); WHEN too_many_rows THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END; IF v_code_record.revoked_at IS NOT NULL THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'revoked'); END IF; IF v_code_record.max_uses IS NOT NULL AND v_code_record.use_count >= v_code_record.max_uses THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'exhausted'); END IF; SELECT * INTO v_existing_membership FROM public.gym_memberships WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; IF v_existing_membership.gym_id IS NOT NULL AND v_existing_membership.status = 'active' THEN IF v_existing_membership.role = 'owner' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_member'); END IF; IF v_existing_membership.role = 'staff' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_member'); END IF; IF v_existing_membership.role = 'member' AND v_code_record.role = 'staff' THEN null; ELSE RETURN jsonb_build_object('ok', false, 'reason', 'already_member'); END IF; END IF; IF v_code_record.role = 'member' THEN UPDATE public.gym_memberships SET status = 'removed' WHERE public.gym_memberships.user_id = v_caller_id AND public.gym_memberships.role = 'member' AND public.gym_memberships.status = 'active' AND public.gym_memberships.gym_id != v_code_record.gym_id; END IF; IF v_existing_membership.gym_id IS NULL THEN INSERT INTO public.gym_memberships (gym_id, user_id, role, status, joined_at) VALUES (v_code_record.gym_id, v_caller_id, v_code_record.role, 'active', now()); ELSE UPDATE public.gym_memberships SET role = v_code_record.role, status = 'active', joined_at = CASE WHEN public.gym_memberships.status = 'removed' THEN now() ELSE public.gym_memberships.joined_at END WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; END IF; UPDATE public.gym_join_codes SET use_count = use_count + 1 WHERE id = v_code_record.id; RETURN jsonb_build_object('ok', true, 'gym_id', v_code_record.gym_id::text, 'gym_name', v_code_record.gym_name); END; \$\$; REVOKE EXECUTE ON FUNCTION public.redeem_join_code(text) FROM public, anon; GRANT EXECUTE ON FUNCTION public.redeem_join_code(text) TO authenticated;"

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

# Mutant (g): Weaken inline throttle threshold in preview and redeem from 10 to 20
run_mutant \
  "(g) weaken inline throttle threshold to 20" \
  "Allow 20 misses instead of 10 in preview and redeem" \
  "DROP FUNCTION IF EXISTS public.preview_join_code(text); CREATE FUNCTION public.preview_join_code(p_code text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = '' AS \$\$ DECLARE v_caller_id uuid; v_result record; v_is_read_only text; v_attempt_count int; BEGIN v_caller_id := auth.uid(); IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING errcode = 'GJC00'; END IF; v_is_read_only := current_setting('transaction_read_only'); IF v_is_read_only = 'on' THEN RAISE EXCEPTION 'Read-only access not permitted' USING errcode = 'GJC11'; END IF; SELECT count(*) INTO v_attempt_count FROM public.gym_join_code_attempts WHERE user_id = v_caller_id AND attempted_at > now() - interval '15 minutes'; IF v_attempt_count >= 20 THEN RETURN jsonb_build_object('ok', false, 'reason', 'throttled'); END IF; BEGIN SELECT public.gyms.name, public.gyms.slug, public.gym_join_codes.role INTO STRICT v_result FROM public.gym_join_codes JOIN public.gyms ON public.gym_join_codes.gym_id = public.gyms.id WHERE upper(public.gym_join_codes.code) = upper(p_code) AND public.gym_join_codes.revoked_at IS NULL AND (public.gym_join_codes.expires_at IS NULL OR public.gym_join_codes.expires_at > now()) AND (public.gym_join_codes.max_uses IS NULL OR public.gym_join_codes.use_count < public.gym_join_codes.max_uses) LIMIT 1; RETURN jsonb_build_object('ok', true, 'gym_name', v_result.name, 'gym_slug', v_result.slug, 'role', v_result.role); EXCEPTION WHEN no_data_found THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); WHEN too_many_rows THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END; END; \$\$; REVOKE EXECUTE ON FUNCTION public.preview_join_code(text) FROM public, anon; GRANT EXECUTE ON FUNCTION public.preview_join_code(text) TO authenticated; DROP FUNCTION IF EXISTS public.redeem_join_code(text); CREATE FUNCTION public.redeem_join_code(p_code text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = '' AS \$\$ DECLARE v_code_record record; v_caller_id uuid; v_existing_membership record; v_is_read_only text; v_attempt_count int; BEGIN v_caller_id := auth.uid(); IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING errcode = 'GJC00'; END IF; v_is_read_only := current_setting('transaction_read_only'); IF v_is_read_only = 'on' THEN RAISE EXCEPTION 'Read-only access not permitted' USING errcode = 'GJC11'; END IF; SELECT count(*) INTO v_attempt_count FROM public.gym_join_code_attempts WHERE user_id = v_caller_id AND attempted_at > now() - interval '15 minutes'; IF v_attempt_count >= 20 THEN RETURN jsonb_build_object('ok', false, 'reason', 'throttled'); END IF; BEGIN SELECT public.gym_join_codes.id, public.gym_join_codes.gym_id, public.gym_join_codes.role, public.gym_join_codes.use_count, public.gym_join_codes.max_uses, public.gym_join_codes.expires_at, public.gym_join_codes.revoked_at, public.gyms.name AS gym_name INTO STRICT v_code_record FROM public.gym_join_codes JOIN public.gyms ON public.gym_join_codes.gym_id = public.gyms.id WHERE upper(public.gym_join_codes.code) = upper(p_code) FOR UPDATE; EXCEPTION WHEN no_data_found THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); WHEN too_many_rows THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END; IF v_code_record.revoked_at IS NOT NULL THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'revoked'); END IF; IF v_code_record.expires_at IS NOT NULL AND v_code_record.expires_at <= now() THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'expired'); END IF; IF v_code_record.max_uses IS NOT NULL AND v_code_record.use_count >= v_code_record.max_uses THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'exhausted'); END IF; SELECT * INTO v_existing_membership FROM public.gym_memberships WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; IF v_existing_membership.gym_id IS NOT NULL AND v_existing_membership.status = 'active' THEN IF v_existing_membership.role = 'owner' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_member'); END IF; IF v_existing_membership.role = 'staff' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_member'); END IF; IF v_existing_membership.role = 'member' AND v_code_record.role = 'staff' THEN null; ELSE RETURN jsonb_build_object('ok', false, 'reason', 'already_member'); END IF; END IF; IF v_code_record.role = 'member' THEN UPDATE public.gym_memberships SET status = 'removed' WHERE public.gym_memberships.user_id = v_caller_id AND public.gym_memberships.role = 'member' AND public.gym_memberships.status = 'active' AND public.gym_memberships.gym_id != v_code_record.gym_id; END IF; IF v_existing_membership.gym_id IS NULL THEN INSERT INTO public.gym_memberships (gym_id, user_id, role, status, joined_at) VALUES (v_code_record.gym_id, v_caller_id, v_code_record.role, 'active', now()); ELSE UPDATE public.gym_memberships SET role = v_code_record.role, status = 'active', joined_at = CASE WHEN public.gym_memberships.status = 'removed' THEN now() ELSE public.gym_memberships.joined_at END WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; END IF; UPDATE public.gym_join_codes SET use_count = use_count + 1 WHERE id = v_code_record.id; RETURN jsonb_build_object('ok', true, 'gym_id', v_code_record.gym_id::text, 'gym_name', v_code_record.gym_name); END; \$\$; REVOKE EXECUTE ON FUNCTION public.redeem_join_code(text) FROM public, anon; GRANT EXECUTE ON FUNCTION public.redeem_join_code(text) TO authenticated;"

# Mutant (h): Make throttle count ALL attempts (not just misses) - updated for jsonb return
run_mutant \
  "(h) throttle counts successes too" \
  "Record successful attempts in throttle (should only count misses)" \
  "DROP FUNCTION IF EXISTS public.redeem_join_code(text); CREATE FUNCTION public.redeem_join_code(p_code text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = '' AS \$\$ DECLARE v_code_record record; v_caller_id uuid; v_existing_membership record; v_is_read_only text; v_attempt_count int; BEGIN v_caller_id := auth.uid(); IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING errcode = 'GJC00'; END IF; v_is_read_only := current_setting('transaction_read_only'); IF v_is_read_only = 'on' THEN RAISE EXCEPTION 'Read-only access not permitted' USING errcode = 'GJC11'; END IF; SELECT count(*) INTO v_attempt_count FROM public.gym_join_code_attempts WHERE user_id = v_caller_id AND attempted_at > now() - interval '15 minutes'; IF v_attempt_count >= 10 THEN RETURN jsonb_build_object('ok', false, 'reason', 'throttled'); END IF; BEGIN SELECT public.gym_join_codes.id, public.gym_join_codes.gym_id, public.gym_join_codes.role, public.gym_join_codes.use_count, public.gym_join_codes.max_uses, public.gym_join_codes.expires_at, public.gym_join_codes.revoked_at, public.gyms.name AS gym_name INTO STRICT v_code_record FROM public.gym_join_codes JOIN public.gyms ON public.gym_join_codes.gym_id = public.gyms.id WHERE upper(public.gym_join_codes.code) = upper(p_code) FOR UPDATE; EXCEPTION WHEN no_data_found THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); WHEN too_many_rows THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END; IF v_code_record.revoked_at IS NOT NULL THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'revoked'); END IF; IF v_code_record.expires_at IS NOT NULL AND v_code_record.expires_at <= now() THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'expired'); END IF; IF v_code_record.max_uses IS NOT NULL AND v_code_record.use_count >= v_code_record.max_uses THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'exhausted'); END IF; SELECT * INTO v_existing_membership FROM public.gym_memberships WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; IF v_existing_membership.gym_id IS NOT NULL AND v_existing_membership.status = 'active' THEN IF v_existing_membership.role = 'owner' THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'already_member'); END IF; IF v_existing_membership.role = 'staff' THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'already_member'); END IF; IF v_existing_membership.role = 'member' AND v_code_record.role = 'staff' THEN null; ELSE PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'already_member'); END IF; END IF; IF v_code_record.role = 'member' THEN UPDATE public.gym_memberships SET status = 'removed' WHERE public.gym_memberships.user_id = v_caller_id AND public.gym_memberships.role = 'member' AND public.gym_memberships.status = 'active' AND public.gym_memberships.gym_id != v_code_record.gym_id; END IF; IF v_existing_membership.gym_id IS NULL THEN INSERT INTO public.gym_memberships (gym_id, user_id, role, status, joined_at) VALUES (v_code_record.gym_id, v_caller_id, v_code_record.role, 'active', now()); ELSE UPDATE public.gym_memberships SET role = v_code_record.role, status = 'active', joined_at = CASE WHEN public.gym_memberships.status = 'removed' THEN now() ELSE public.gym_memberships.joined_at END WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; END IF; UPDATE public.gym_join_codes SET use_count = use_count + 1 WHERE id = v_code_record.id; PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', true, 'gym_id', v_code_record.gym_id::text, 'gym_name', v_code_record.gym_name); END; \$\$; REVOKE EXECUTE ON FUNCTION public.redeem_join_code(text) FROM public, anon; GRANT EXECUTE ON FUNCTION public.redeem_join_code(text) TO authenticated;"

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

# Mutant (l): Member upgrade to staff doesn't change role - updated for jsonb return
run_mutant \
  "(l) member upgrade to staff doesn't change role" \
  "Member upgrade to staff returns ok but doesn't actually change role" \
  "DROP FUNCTION IF EXISTS public.redeem_join_code(text); CREATE FUNCTION public.redeem_join_code(p_code text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = '' AS \$\$ DECLARE v_code_record record; v_caller_id uuid; v_existing_membership record; v_is_read_only text; v_attempt_count int; BEGIN v_caller_id := auth.uid(); IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING errcode = 'GJC00'; END IF; v_is_read_only := current_setting('transaction_read_only'); IF v_is_read_only = 'on' THEN RAISE EXCEPTION 'Read-only access not permitted' USING errcode = 'GJC11'; END IF; SELECT count(*) INTO v_attempt_count FROM public.gym_join_code_attempts WHERE user_id = v_caller_id AND attempted_at > now() - interval '15 minutes'; IF v_attempt_count >= 10 THEN RETURN jsonb_build_object('ok', false, 'reason', 'throttled'); END IF; BEGIN SELECT public.gym_join_codes.id, public.gym_join_codes.gym_id, public.gym_join_codes.role, public.gym_join_codes.use_count, public.gym_join_codes.max_uses, public.gym_join_codes.expires_at, public.gym_join_codes.revoked_at, public.gyms.name AS gym_name INTO STRICT v_code_record FROM public.gym_join_codes JOIN public.gyms ON public.gym_join_codes.gym_id = public.gyms.id WHERE upper(public.gym_join_codes.code) = upper(p_code) FOR UPDATE; EXCEPTION WHEN no_data_found THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); WHEN too_many_rows THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END; IF v_code_record.revoked_at IS NOT NULL THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'revoked'); END IF; IF v_code_record.expires_at IS NOT NULL AND v_code_record.expires_at <= now() THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'expired'); END IF; IF v_code_record.max_uses IS NOT NULL AND v_code_record.use_count >= v_code_record.max_uses THEN PERFORM public.record_join_code_miss(v_caller_id); RETURN jsonb_build_object('ok', false, 'reason', 'exhausted'); END IF; SELECT * INTO v_existing_membership FROM public.gym_memberships WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; IF v_existing_membership.gym_id IS NOT NULL AND v_existing_membership.status = 'active' THEN IF v_existing_membership.role = 'owner' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_member'); END IF; IF v_existing_membership.role = 'staff' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_member'); END IF; IF v_existing_membership.role = 'member' AND v_code_record.role = 'staff' THEN null; ELSE RETURN jsonb_build_object('ok', false, 'reason', 'already_member'); END IF; END IF; IF v_code_record.role = 'member' THEN UPDATE public.gym_memberships SET status = 'removed' WHERE public.gym_memberships.user_id = v_caller_id AND public.gym_memberships.role = 'member' AND public.gym_memberships.status = 'active' AND public.gym_memberships.gym_id != v_code_record.gym_id; END IF; IF v_existing_membership.gym_id IS NULL THEN INSERT INTO public.gym_memberships (gym_id, user_id, role, status, joined_at) VALUES (v_code_record.gym_id, v_caller_id, v_code_record.role, 'active', now()); ELSE UPDATE public.gym_memberships SET status = 'active', joined_at = CASE WHEN public.gym_memberships.status = 'removed' THEN now() ELSE public.gym_memberships.joined_at END WHERE public.gym_memberships.gym_id = v_code_record.gym_id AND public.gym_memberships.user_id = v_caller_id; END IF; UPDATE public.gym_join_codes SET use_count = use_count + 1 WHERE id = v_code_record.id; RETURN jsonb_build_object('ok', true, 'gym_id', v_code_record.gym_id::text, 'gym_name', v_code_record.gym_name); END; \$\$; REVOKE EXECUTE ON FUNCTION public.redeem_join_code(text) FROM public, anon; GRANT EXECUTE ON FUNCTION public.redeem_join_code(text) TO authenticated;"

echo
echo "========================================="
echo "Mutant Test Summary"
echo "========================================="
TOTAL_MUTANTS=12
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
