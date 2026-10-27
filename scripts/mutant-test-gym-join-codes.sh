#!/usr/bin/env bash
set -euo pipefail

# Mutant test script for gym join codes
# Tests that removing key constraints or policies causes test failures
# Uses SQL commands applied after db reset (not sed on migration files)

echo "=== Mutant Testing: Gym Join Codes ==="
echo

# Database reset guard: prevent accidental wipes on shared boxes
if ! npx tsx scripts/lib/db-reset-guard-cli.ts; then
  exit 1
fi
echo

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
  "create or replace function public.redeem_join_code(p_code text) returns table(gym_id uuid, gym_name text) language plpgsql security definer set search_path = '' as \$\$ declare v_code_record record; v_caller_id uuid; v_existing_membership record; begin v_caller_id := auth.uid(); if v_caller_id is null then raise exception 'Not authenticated'; end if; select public.gym_join_codes.id, public.gym_join_codes.gym_id, public.gym_join_codes.role, public.gym_join_codes.use_count, public.gym_join_codes.max_uses, public.gym_join_codes.expires_at, public.gym_join_codes.revoked_at, public.gyms.name as gym_name into v_code_record from public.gym_join_codes join public.gyms on public.gym_join_codes.gym_id = public.gyms.id where upper(public.gym_join_codes.code) = upper(p_code); if v_code_record.id is null then raise exception 'Invalid code'; end if; if v_code_record.revoked_at is not null then raise exception 'Invalid code'; end if; if v_code_record.expires_at is not null and v_code_record.expires_at <= now() then raise exception 'Invalid code'; end if; if v_code_record.max_uses is not null and v_code_record.use_count >= v_code_record.max_uses then raise exception 'Invalid code'; end if; select * into v_existing_membership from public.gym_memberships where gym_id = v_code_record.gym_id and user_id = v_caller_id; if v_existing_membership.gym_id is not null then if v_existing_membership.status = 'active' then if (v_existing_membership.role = v_code_record.role) or (v_existing_membership.role = 'owner') or (v_existing_membership.role = 'staff' and v_code_record.role = 'member') then return query select v_code_record.gym_id, v_code_record.gym_name; return; end if; end if; end if; if v_code_record.role = 'member' then update public.gym_memberships set status = 'removed' where user_id = v_caller_id and role = 'member' and status = 'active' and gym_id != v_code_record.gym_id; end if; if v_existing_membership.gym_id is null then insert into public.gym_memberships (gym_id, user_id, role, status, joined_at) values (v_code_record.gym_id, v_caller_id, v_code_record.role, 'active', now()); else update public.gym_memberships set role = v_code_record.role, status = 'active', joined_at = case when status = 'removed' then now() else joined_at end where gym_id = v_code_record.gym_id and user_id = v_caller_id; end if; update public.gym_join_codes set use_count = use_count + 1 where id = v_code_record.id; return query select v_code_record.gym_id, v_code_record.gym_name; end; \$\$;"

# Mutant (b): Skip use_count check
run_mutant \
  "(b) skip use_count check" \
  "Remove max_uses exhaustion check" \
  "create or replace function public.redeem_join_code(p_code text) returns table(gym_id uuid, gym_name text) language plpgsql security definer set search_path = '' as \$\$ declare v_code_record record; v_caller_id uuid; v_existing_membership record; begin v_caller_id := auth.uid(); if v_caller_id is null then raise exception 'Not authenticated'; end if; select public.gym_join_codes.id, public.gym_join_codes.gym_id, public.gym_join_codes.role, public.gym_join_codes.use_count, public.gym_join_codes.max_uses, public.gym_join_codes.expires_at, public.gym_join_codes.revoked_at, public.gyms.name as gym_name into v_code_record from public.gym_join_codes join public.gyms on public.gym_join_codes.gym_id = public.gyms.id where upper(public.gym_join_codes.code) = upper(p_code) for update; if v_code_record.id is null then raise exception 'Invalid code'; end if; if v_code_record.revoked_at is not null then raise exception 'Invalid code'; end if; if v_code_record.expires_at is not null and v_code_record.expires_at <= now() then raise exception 'Invalid code'; end if; select * into v_existing_membership from public.gym_memberships where gym_id = v_code_record.gym_id and user_id = v_caller_id; if v_existing_membership.gym_id is not null then if v_existing_membership.status = 'active' then if (v_existing_membership.role = v_code_record.role) or (v_existing_membership.role = 'owner') or (v_existing_membership.role = 'staff' and v_code_record.role = 'member') then return query select v_code_record.gym_id, v_code_record.gym_name; return; end if; end if; end if; if v_code_record.role = 'member' then update public.gym_memberships set status = 'removed' where user_id = v_caller_id and role = 'member' and status = 'active' and gym_id != v_code_record.gym_id; end if; if v_existing_membership.gym_id is null then insert into public.gym_memberships (gym_id, user_id, role, status, joined_at) values (v_code_record.gym_id, v_caller_id, v_code_record.role, 'active', now()); else update public.gym_memberships set role = v_code_record.role, status = 'active', joined_at = case when status = 'removed' then now() else joined_at end where gym_id = v_code_record.gym_id and user_id = v_caller_id; end if; update public.gym_join_codes set use_count = use_count + 1 where id = v_code_record.id; return query select v_code_record.gym_id, v_code_record.gym_name; end; \$\$;"

# Mutant (c): Delete instead of status='removed'
run_mutant \
  "(c) delete instead of status=removed" \
  "Delete old membership instead of setting status=removed" \
  "create or replace function public.redeem_join_code(p_code text) returns table(gym_id uuid, gym_name text) language plpgsql security definer set search_path = '' as \$\$ declare v_code_record record; v_caller_id uuid; v_existing_membership record; begin v_caller_id := auth.uid(); if v_caller_id is null then raise exception 'Not authenticated'; end if; select public.gym_join_codes.id, public.gym_join_codes.gym_id, public.gym_join_codes.role, public.gym_join_codes.use_count, public.gym_join_codes.max_uses, public.gym_join_codes.expires_at, public.gym_join_codes.revoked_at, public.gyms.name as gym_name into v_code_record from public.gym_join_codes join public.gyms on public.gym_join_codes.gym_id = public.gyms.id where upper(public.gym_join_codes.code) = upper(p_code) for update; if v_code_record.id is null then raise exception 'Invalid code'; end if; if v_code_record.revoked_at is not null then raise exception 'Invalid code'; end if; if v_code_record.expires_at is not null and v_code_record.expires_at <= now() then raise exception 'Invalid code'; end if; if v_code_record.max_uses is not null and v_code_record.use_count >= v_code_record.max_uses then raise exception 'Invalid code'; end if; select * into v_existing_membership from public.gym_memberships where gym_id = v_code_record.gym_id and user_id = v_caller_id; if v_existing_membership.gym_id is not null then if v_existing_membership.status = 'active' then if (v_existing_membership.role = v_code_record.role) or (v_existing_membership.role = 'owner') or (v_existing_membership.role = 'staff' and v_code_record.role = 'member') then return query select v_code_record.gym_id, v_code_record.gym_name; return; end if; end if; end if; if v_code_record.role = 'member' then delete from public.gym_memberships where user_id = v_caller_id and role = 'member' and status = 'active' and gym_id != v_code_record.gym_id; end if; if v_existing_membership.gym_id is null then insert into public.gym_memberships (gym_id, user_id, role, status, joined_at) values (v_code_record.gym_id, v_caller_id, v_code_record.role, 'active', now()); else update public.gym_memberships set role = v_code_record.role, status = 'active', joined_at = case when status = 'removed' then now() else joined_at end where gym_id = v_code_record.gym_id and user_id = v_caller_id; end if; update public.gym_join_codes set use_count = use_count + 1 where id = v_code_record.id; return query select v_code_record.gym_id, v_code_record.gym_name; end; \$\$;"

# Mutant (d): Skip expiry check
run_mutant \
  "(d) skip expiry check" \
  "Allow redemption of expired codes" \
  "create or replace function public.redeem_join_code(p_code text) returns table(gym_id uuid, gym_name text) language plpgsql security definer set search_path = '' as \$\$ declare v_code_record record; v_caller_id uuid; v_existing_membership record; begin v_caller_id := auth.uid(); if v_caller_id is null then raise exception 'Not authenticated'; end if; select public.gym_join_codes.id, public.gym_join_codes.gym_id, public.gym_join_codes.role, public.gym_join_codes.use_count, public.gym_join_codes.max_uses, public.gym_join_codes.expires_at, public.gym_join_codes.revoked_at, public.gyms.name as gym_name into v_code_record from public.gym_join_codes join public.gyms on public.gym_join_codes.gym_id = public.gyms.id where upper(public.gym_join_codes.code) = upper(p_code) for update; if v_code_record.id is null then raise exception 'Invalid code'; end if; if v_code_record.revoked_at is not null then raise exception 'Invalid code'; end if; if v_code_record.max_uses is not null and v_code_record.use_count >= v_code_record.max_uses then raise exception 'Invalid code'; end if; select * into v_existing_membership from public.gym_memberships where gym_id = v_code_record.gym_id and user_id = v_caller_id; if v_existing_membership.gym_id is not null then if v_existing_membership.status = 'active' then if (v_existing_membership.role = v_code_record.role) or (v_existing_membership.role = 'owner') or (v_existing_membership.role = 'staff' and v_code_record.role = 'member') then return query select v_code_record.gym_id, v_code_record.gym_name; return; end if; end if; end if; if v_code_record.role = 'member' then update public.gym_memberships set status = 'removed' where user_id = v_caller_id and role = 'member' and status = 'active' and gym_id != v_code_record.gym_id; end if; if v_existing_membership.gym_id is null then insert into public.gym_memberships (gym_id, user_id, role, status, joined_at) values (v_code_record.gym_id, v_caller_id, v_code_record.role, 'active', now()); else update public.gym_memberships set role = v_code_record.role, status = 'active', joined_at = case when status = 'removed' then now() else joined_at end where gym_id = v_code_record.gym_id and user_id = v_caller_id; end if; update public.gym_join_codes set use_count = use_count + 1 where id = v_code_record.id; return query select v_code_record.gym_id, v_code_record.gym_name; end; \$\$;"

# Mutant (e): Grant to anon
run_mutant \
  "(e) grant functions to anon" \
  "Allow unauthenticated users to redeem codes" \
  "grant execute on function public.redeem_join_code(text) to anon;"

# Mutant (f): Drop owner SELECT RLS policy
run_mutant \
  "(f) drop owner SELECT RLS policy" \
  "Remove policy allowing owners to see codes" \
  "drop policy if exists gym_join_codes_owner_select on public.gym_join_codes;"

# Mutant (g): Drop staff SELECT RLS policy
run_mutant \
  "(g) drop staff SELECT RLS policy" \
  "Remove policy allowing staff to see member codes" \
  "drop policy if exists gym_join_codes_staff_select on public.gym_join_codes;"

# Mutant (h): Drop owner INSERT RLS policy
run_mutant \
  "(h) drop owner INSERT RLS policy" \
  "Remove policy allowing owners to create codes" \
  "drop policy if exists gym_join_codes_owner_insert on public.gym_join_codes;"

# Mutant (i): Allow staff to create staff codes
run_mutant \
  "(i) allow staff to create staff codes" \
  "Weaken create_join_code to allow staff to create staff codes" \
  "create or replace function public.create_join_code(p_gym_id uuid, p_role gym_role, p_expires_at timestamptz default null, p_max_uses int default null) returns table(id uuid, code text) language plpgsql security definer set search_path = '' as \$\$ declare v_caller_id uuid; v_new_code text; v_new_id uuid; v_attempts int := 0; v_max_attempts int := 10; begin v_caller_id := auth.uid(); if v_caller_id is null then raise exception 'Not authenticated'; end if; if not (public.is_gym_owner(p_gym_id) or public.is_gym_staff(p_gym_id)) then raise exception 'Only gym owners and staff can create join codes'; end if; if p_role not in ('member', 'staff') then raise exception 'Role must be member or staff'; end if; loop v_new_code := public.generate_join_code(); v_new_id := gen_random_uuid(); begin insert into public.gym_join_codes (id, gym_id, code, role, created_by, created_at, expires_at, max_uses, use_count, revoked_at) values (v_new_id, p_gym_id, v_new_code, p_role, v_caller_id, now(), p_expires_at, p_max_uses, 0, null); exit; exception when unique_violation then v_attempts := v_attempts + 1; if v_attempts >= v_max_attempts then raise exception 'Failed to generate unique code after % attempts', v_max_attempts; end if; end; end loop; return query select v_new_id, v_new_code; end; \$\$;"

# Mutant (j): Filter already-in-gym check on role='member'
run_mutant \
  "(j) filter already-in-gym check on role=member" \
  "Change redeem_join_code to only check for member role when determining if already in gym" \
  "create or replace function public.redeem_join_code(p_code text) returns table(gym_id uuid, gym_name text) language plpgsql security definer set search_path = '' as \$\$ declare v_code_record record; v_caller_id uuid; v_existing_membership record; begin v_caller_id := auth.uid(); if v_caller_id is null then raise exception 'Not authenticated'; end if; select public.gym_join_codes.id, public.gym_join_codes.gym_id, public.gym_join_codes.role, public.gym_join_codes.use_count, public.gym_join_codes.max_uses, public.gym_join_codes.expires_at, public.gym_join_codes.revoked_at, public.gyms.name as gym_name into v_code_record from public.gym_join_codes join public.gyms on public.gym_join_codes.gym_id = public.gyms.id where upper(public.gym_join_codes.code) = upper(p_code) for update; if v_code_record.id is null then raise exception 'Invalid code'; end if; if v_code_record.revoked_at is not null then raise exception 'Invalid code'; end if; if v_code_record.expires_at is not null and v_code_record.expires_at <= now() then raise exception 'Invalid code'; end if; if v_code_record.max_uses is not null and v_code_record.use_count >= v_code_record.max_uses then raise exception 'Invalid code'; end if; select * into v_existing_membership from public.gym_memberships where gym_id = v_code_record.gym_id and user_id = v_caller_id and role = 'member'; if v_existing_membership.gym_id is not null and v_existing_membership.status = 'active' then return query select v_code_record.gym_id, v_code_record.gym_name; return; end if; if v_code_record.role = 'member' then update public.gym_memberships set status = 'removed' where user_id = v_caller_id and role = 'member' and status = 'active' and gym_id != v_code_record.gym_id; end if; if v_existing_membership.gym_id is null then insert into public.gym_memberships (gym_id, user_id, role, status, joined_at) values (v_code_record.gym_id, v_caller_id, v_code_record.role, 'active', now()); else update public.gym_memberships set role = v_code_record.role, status = 'active', joined_at = case when status = 'removed' then now() else joined_at end where gym_id = v_code_record.gym_id and user_id = v_caller_id; end if; update public.gym_join_codes set use_count = use_count + 1 where id = v_code_record.id; return query select v_code_record.gym_id, v_code_record.gym_name; end; \$\$;"

echo
echo "========================================="
echo "Mutant Test Summary"
echo "========================================="
echo "Total mutants:                   10"
echo "Killed:                          $((9 - FAILED - ${#SKIPPED[@]}))"
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
