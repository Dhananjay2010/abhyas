#!/usr/bin/env bash
set -euo pipefail

# Mutant test script for gym RLS policies
# Tests that removing key constraints or policies causes test failures
# Uses SQL commands applied after db reset (not sed on migration files)

echo "=== Mutant Testing: Gym RLS Policies ==="
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
if ! supabase status &>/dev/null; then
  echo "❌ Supabase not running. Start it with: supabase start"
  exit 1
fi

FAILED=0
SURVIVORS=()
SKIPPED=()

echo "Running baseline tests..."
if ! supabase db reset > /dev/null 2>&1; then
  echo "❌ Baseline: db reset failed" >&2
  exit 1
fi

if ! REAL_DB=1 npm run test:gym-tenant-rls-real-db > /dev/null 2>&1; then
  echo "❌ Baseline tests failed. Fix the code before running mutant tests." >&2
  exit 1
fi
echo "✓ Baseline tests pass"

# Restart Supabase to ensure clean state for mutants
echo "Restarting Supabase for mutant tests..."
if ! supabase stop > /dev/null 2>&1; then
  echo "⚠️  Warning: supabase stop failed" >&2
fi
sleep 2
if ! supabase start > /dev/null 2>&1; then
  echo "❌ Failed to restart Supabase" >&2
  exit 1
fi
echo "✓ Supabase restarted"
echo

run_mutant() {
  local name="$1"
  local description="$2"
  local sql_mutation="$3"
  
  echo "Testing mutant: $name"
  echo "  $description"
  
  # Reset database
  if ! supabase db reset > /dev/null 2>&1; then
    echo "  ❌ SKIPPED: db reset failed"
    SKIPPED+=("$name: db reset failed")
    sleep 2
    return 0
  fi
  
  # Apply mutation via psql
  if ! psql "${SUPABASE_DB_URL:-postgresql://postgres:postgres@localhost:54322/postgres}" \
    -c "$sql_mutation" > /dev/null 2>&1; then
    echo "  ❌ SKIPPED: mutation SQL failed"
    SKIPPED+=("$name: mutation failed")
    sleep 2
    return 0
  fi
  
  # Run tests
  if REAL_DB=1 npm run test:gym-tenant-rls-real-db > /dev/null 2>&1; then
    echo "  ❌ SURVIVED"
    SURVIVORS+=("$name")
    FAILED=$((FAILED + 1))
  else
    echo "  ✅ KILLED"
  fi
  
  sleep 2
  return 0
}

# Mutant (a): Remove one-active-owner constraint
run_mutant \
  "(a) remove one-active-owner constraint" \
  "Remove the partial unique index ensuring 0 or 1 owner per gym" \
  "drop index if exists public.gym_memberships_one_active_owner_per_gym;"

# Mutant (b): Remove one-active-member-per-user constraint
run_mutant \
  "(b) remove one-active-member-per-user constraint" \
  "Remove the partial unique index ensuring at most one active member per user" \
  "drop index if exists public.gym_memberships_one_active_member_per_user;"

# Mutant (c): Remove gym SELECT policy
run_mutant \
  "(c) remove gym SELECT policy" \
  "Remove the policy allowing members to see their gym" \
  "drop policy if exists gyms_member_select on public.gyms;"

# Mutant (d): Remove gym_memberships own SELECT
run_mutant \
  "(d) remove gym_memberships own SELECT" \
  "Remove the policy allowing users to see their own memberships" \
  "drop policy if exists gym_memberships_own_select on public.gym_memberships;"

# Mutant (e): Remove gym_memberships staff SELECT
run_mutant \
  "(e) remove gym_memberships staff SELECT" \
  "Remove the policy allowing staff to see all memberships" \
  "drop policy if exists gym_memberships_staff_select on public.gym_memberships;"

# Mutant (f): Remove gym owner UPDATE
run_mutant \
  "(f) remove gym owner UPDATE" \
  "Remove the policy allowing owners to update their gym" \
  "drop policy if exists gyms_owner_update on public.gyms;"

# Mutant (g): Remove gym_memberships INSERT
run_mutant \
  "(g) remove gym_memberships INSERT" \
  "Remove the policy blocking member-role client inserts" \
  "drop policy if exists gym_memberships_owner_insert on public.gym_memberships;"

# Mutant (h): Remove gym_memberships UPDATE
run_mutant \
  "(h) remove gym_memberships UPDATE" \
  "Remove the policy allowing only owners to update memberships" \
  "drop policy if exists gym_memberships_owner_update on public.gym_memberships;"

# Mutant (i): Remove gym_memberships DELETE
run_mutant \
  "(i) remove gym_memberships DELETE" \
  "Remove the policy allowing only owners to delete memberships" \
  "drop policy if exists gym_memberships_owner_delete on public.gym_memberships;"

# Mutant (j): Remove ON DELETE CASCADE
run_mutant \
  "(j) remove ON DELETE CASCADE" \
  "Remove cascade deletion of memberships when user is deleted" \
  "alter table public.gym_memberships drop constraint gym_memberships_user_id_fkey; alter table public.gym_memberships add constraint gym_memberships_user_id_fkey foreign key (user_id) references auth.users(id);"

# Mutant (k): Remove default gym creation
run_mutant \
  "(k) remove default gym creation" \
  "Don't create the default gym" \
  "delete from public.gyms where slug = 'default';"

# Mutant (l): Remove new user trigger
run_mutant \
  "(l) remove new user trigger" \
  "Don't auto-add new signups to default gym" \
  "drop trigger if exists add_new_user_to_default_gym_trigger on public.profiles;"

# Mutant (m): Remove owner self-demotion trigger
run_mutant \
  "(m) remove owner self-demotion trigger" \
  "Allow owner to demote themselves" \
  "drop trigger if exists prevent_owner_self_demotion on public.gym_memberships;"

# Mutant (n): Remove owner self-deletion trigger
run_mutant \
  "(n) remove owner self-deletion trigger" \
  "Allow owner to delete their own membership" \
  "drop trigger if exists prevent_owner_self_deletion on public.gym_memberships;"

# Mutant (o): Remove immutability trigger
run_mutant \
  "(o) remove immutability trigger" \
  "Allow gym_id and user_id to be changed" \
  "drop trigger if exists prevent_membership_id_change on public.gym_memberships;"

echo
echo "========================================="
echo "Mutant Test Summary"
echo "========================================="
echo "Total mutants:                   15"
echo "Killed:                          $((15 - FAILED - ${#SKIPPED[@]}))"
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
