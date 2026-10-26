#!/usr/bin/env bash
set -euo pipefail

# Mutant test script for gym RLS policies
# Tests that removing key constraints or policies causes test failures
# Uses SQL mutation on migration files with mktemp backups

echo "=== Mutant Testing: Gym RLS Policies ==="
echo

# Check we're in the repo root
if [ ! -f "package.json" ]; then
  echo "❌ ERROR: Must run from repo root" >&2
  exit 1
fi

# Check required tools
for cmd in sha256sum cmp; do
  if ! command -v "$cmd" > /dev/null 2>&1; then
    echo "❌ ERROR: Required command '$cmd' not found" >&2
    exit 1
  fi
done

SCHEMA_FILE="supabase/migrations/20261025000034_gym_tenant_schema.sql"
BACKFILL_FILE="supabase/migrations/20261025000035_gym_backfill_default.sql"

if [ ! -f "$SCHEMA_FILE" ]; then
  echo "❌ ERROR: Schema migration not found: $SCHEMA_FILE" >&2
  exit 1
fi

if [ ! -f "$BACKFILL_FILE" ]; then
  echo "❌ ERROR: Backfill migration not found: $BACKFILL_FILE" >&2
  exit 1
fi

# Check for uncommitted changes
for f in "$SCHEMA_FILE" "$BACKFILL_FILE"; do
  if ! git diff --quiet -- "$f" 2>/dev/null; then
    echo "❌ ERROR: File has uncommitted changes: $f" >&2
    echo "   Commit or stash changes before running mutant tests" >&2
    exit 1
  fi
done

SCHEMA_BACKUP=$(mktemp)
BACKFILL_BACKUP=$(mktemp)
FAILED=0
SURVIVORS=()
SKIPPED=()
MUTATION_APPLIED=false
CLEANUP_DONE=false

# Save originals
cp "$SCHEMA_FILE" "$SCHEMA_BACKUP"
cp "$BACKFILL_FILE" "$BACKFILL_BACKUP"

SCHEMA_ORIG_SHA=$(sha256sum "$SCHEMA_FILE" | cut -d' ' -f1)
BACKFILL_ORIG_SHA=$(sha256sum "$BACKFILL_FILE" | cut -d' ' -f1)

restore_or_die() {
  if [ ! -f "$SCHEMA_BACKUP" ] || [ ! -f "$BACKFILL_BACKUP" ]; then
    echo "❌ FATAL: Backup file(s) missing" >&2
    exit 1
  fi
  
  # Restore schema
  local temp_restore
  temp_restore=$(mktemp "${SCHEMA_FILE}.restore.XXXXXX")
  cp "$SCHEMA_BACKUP" "$temp_restore"
  mv "$temp_restore" "$SCHEMA_FILE"
  
  # Restore backfill
  temp_restore=$(mktemp "${BACKFILL_FILE}.restore.XXXXXX")
  cp "$BACKFILL_BACKUP" "$temp_restore"
  mv "$temp_restore" "$BACKFILL_FILE"
  
  # Verify
  local restored_sha
  restored_sha=$(sha256sum "$SCHEMA_FILE" | cut -d' ' -f1)
  if [ "$restored_sha" != "$SCHEMA_ORIG_SHA" ]; then
    echo "❌ FATAL: Restored schema file has wrong sha256" >&2
    exit 1
  fi
  
  restored_sha=$(sha256sum "$BACKFILL_FILE" | cut -d' ' -f1)
  if [ "$restored_sha" != "$BACKFILL_ORIG_SHA" ]; then
    echo "❌ FATAL: Restored backfill file has wrong sha256" >&2
    exit 1
  fi
}

cleanup() {
  if [ "$CLEANUP_DONE" = true ]; then
    return 0
  fi
  CLEANUP_DONE=true
  
  if [ "$MUTATION_APPLIED" = true ]; then
    restore_or_die
  fi
  
  rm -f "$SCHEMA_BACKUP" "$BACKFILL_BACKUP"
}

trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

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
echo

run_mutant() {
  local name="$1"
  local description="$2"
  local target_file="$3"
  local search="$4"
  local replace="$5"
  
  echo "Testing mutant: $name"
  echo "  $description"
  
  MUTATION_APPLIED=true
  
  # Apply mutation with sed
  if ! sed -i.bak "s|${search}|${replace}|g" "$target_file" 2>/dev/null; then
    echo "  ❌ SKIPPED: sed failed"
    SKIPPED+=("$name: sed failed")
    MUTATION_APPLIED=false
    return 0
  fi
  rm -f "${target_file}.bak"
  
  # Verify file changed
  if cmp -s "$target_file" "$SCHEMA_BACKUP" 2>/dev/null && [ "$target_file" = "$SCHEMA_FILE" ]; then
    echo "  ❌ SKIPPED: File did not change"
    SKIPPED+=("$name: file unchanged")
    restore_or_die
    MUTATION_APPLIED=false
    return 0
  fi
  
  if cmp -s "$target_file" "$BACKFILL_BACKUP" 2>/dev/null && [ "$target_file" = "$BACKFILL_FILE" ]; then
    echo "  ❌ SKIPPED: File did not change"
    SKIPPED+=("$name: file unchanged")
    restore_or_die
    MUTATION_APPLIED=false
    return 0
  fi
  
  # Reset database with mutated migration
  if ! supabase db reset > /dev/null 2>&1; then
    echo "  ❌ SKIPPED: db reset failed"
    SKIPPED+=("$name: db reset failed")
    restore_or_die
    MUTATION_APPLIED=false
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
  
  # Restore
  restore_or_die
  MUTATION_APPLIED=false
  return 0
}

# Mutant (a): Remove one-active-owner constraint
run_mutant \
  "(a) remove one-active-owner constraint" \
  "Remove the partial unique index ensuring 0 or 1 owner per gym" \
  "$SCHEMA_FILE" \
  "create unique index if not exists gym_memberships_one_active_owner_per_gym" \
  "-- MUTANT: create unique index if not exists gym_memberships_one_active_owner_per_gym"

# Mutant (b): Remove one-active-member-per-user constraint
run_mutant \
  "(b) remove one-active-member-per-user constraint" \
  "Remove the partial unique index ensuring at most one active member per user" \
  "$SCHEMA_FILE" \
  "create unique index if not exists gym_memberships_one_active_member_per_user" \
  "-- MUTANT: create unique index if not exists gym_memberships_one_active_member_per_user"

# Mutant (c): Remove gym SELECT policy for members
run_mutant \
  "(c) remove gym SELECT policy" \
  "Remove the policy allowing members to see their gym" \
  "$SCHEMA_FILE" \
  "create policy gyms_member_select on gyms" \
  "-- MUTANT: create policy gyms_member_select on gyms"

# Mutant (d): Remove gym_memberships own SELECT policy
run_mutant \
  "(d) remove gym_memberships own SELECT" \
  "Remove the policy allowing users to see their own memberships" \
  "$SCHEMA_FILE" \
  "create policy gym_memberships_own_select on gym_memberships" \
  "-- MUTANT: create policy gym_memberships_own_select on gym_memberships"

# Mutant (e): Remove gym_memberships staff SELECT policy
run_mutant \
  "(e) remove gym_memberships staff SELECT" \
  "Remove the policy allowing staff to see all memberships" \
  "$SCHEMA_FILE" \
  "create policy gym_memberships_staff_select on gym_memberships" \
  "-- MUTANT: create policy gym_memberships_staff_select on gym_memberships"

# Mutant (f): Remove gym UPDATE policy for owners
run_mutant \
  "(f) remove gym owner UPDATE" \
  "Remove the policy allowing owners to update their gym" \
  "$SCHEMA_FILE" \
  "create policy gyms_owner_update on gyms" \
  "-- MUTANT: create policy gyms_owner_update on gyms"

# Mutant (g): Remove gym_memberships INSERT policy
run_mutant \
  "(g) remove gym_memberships INSERT" \
  "Remove the policy blocking member-role client inserts" \
  "$SCHEMA_FILE" \
  "create policy gym_memberships_owner_insert on gym_memberships" \
  "-- MUTANT: create policy gym_memberships_owner_insert on gym_memberships"

# Mutant (h): Remove gym_memberships UPDATE policy
run_mutant \
  "(h) remove gym_memberships UPDATE" \
  "Remove the policy allowing only owners to update memberships" \
  "$SCHEMA_FILE" \
  "create policy gym_memberships_owner_update on gym_memberships" \
  "-- MUTANT: create policy gym_memberships_owner_update on gym_memberships"

# Mutant (i): Remove gym_memberships DELETE policy
run_mutant \
  "(i) remove gym_memberships DELETE" \
  "Remove the policy allowing only owners to delete memberships" \
  "$SCHEMA_FILE" \
  "create policy gym_memberships_owner_delete on gym_memberships" \
  "-- MUTANT: create policy gym_memberships_owner_delete on gym_memberships"

# Mutant (j): Remove ON DELETE CASCADE from gym_memberships.user_id
run_mutant \
  "(j) remove ON DELETE CASCADE" \
  "Remove cascade deletion of memberships when user is deleted" \
  "$SCHEMA_FILE" \
  "user_id     uuid not null references auth.users(id) on delete cascade," \
  "user_id     uuid not null references auth.users(id),"

# Mutant (k): Remove default gym creation
run_mutant \
  "(k) remove default gym creation" \
  "Don't create the default gym" \
  "$BACKFILL_FILE" \
  "insert into gyms (slug, name, timezone)" \
  "-- MUTANT: insert into gyms (slug, name, timezone)"

# Mutant (l): Remove backfill of existing users
run_mutant \
  "(l) remove user backfill" \
  "Don't backfill existing users into default gym" \
  "$BACKFILL_FILE" \
  "insert into gym_memberships (gym_id, user_id, role, status, joined_at)" \
  "-- MUTANT: insert into gym_memberships (gym_id, user_id, role, status, joined_at)"

# Mutant (m): Remove new user trigger
run_mutant \
  "(m) remove new user trigger" \
  "Don't auto-add new signups to default gym" \
  "$BACKFILL_FILE" \
  "create trigger add_new_user_to_default_gym_trigger" \
  "-- MUTANT: create trigger add_new_user_to_default_gym_trigger"

echo
echo "========================================="
echo "Mutant Test Summary"
echo "========================================="
TOTAL=13
KILLED=$((TOTAL - FAILED - ${#SKIPPED[@]}))
echo "Total mutants:                   $TOTAL"
echo "Killed:                          $KILLED"
echo "Survived:                        $FAILED"
echo "Skipped:                         ${#SKIPPED[@]}"
echo "========================================="

if [ ${#SURVIVORS[@]} -gt 0 ]; then
  echo
  echo "Survivors:"
  for survivor in "${SURVIVORS[@]}"; do
    echo "  - $survivor"
  done
fi

if [ ${#SKIPPED[@]} -gt 0 ]; then
  echo
  echo "Skipped:"
  for skip in "${SKIPPED[@]}"; do
    echo "  - $skip"
  done
fi

if [ $FAILED -gt 0 ] || [ ${#SKIPPED[@]} -gt 0 ]; then
  echo
  echo "❌ FAIL: $FAILED survivor(s), ${#SKIPPED[@]} skip(s)"
  exit 1
fi

echo
echo "✅ PASS: All mutants killed"
