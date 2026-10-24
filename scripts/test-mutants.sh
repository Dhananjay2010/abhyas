#!/bin/bash
set -e

echo "Testing 7 mutants to verify test catches them..."
echo ""

MIGRATION_FILE="supabase/migrations/20261025000011_catalogue_descriptions.sql"
BACKUP_FILE="/tmp/migration_backup.sql"

cp "$MIGRATION_FILE" "$BACKUP_FILE"

test_mutant() {
  local name="$1"
  local mutant_cmd="$2"
  
  echo "Mutant $name:"
  eval "$mutant_cmd"
  
  if npm run test:catalogue-descriptions >/dev/null 2>&1; then
    echo "  ❌ MISSED - test passed when it should have failed"
    cp "$BACKUP_FILE" "$MIGRATION_FILE"
    return 1
  else
    echo "  ✅ CAUGHT - test failed as expected"
    cp "$BACKUP_FILE" "$MIGRATION_FILE"
    return 0
  fi
}

# Mutant 1: Un-scoped UPDATE (no WHERE)
test_mutant "1: Un-scoped UPDATE" \
  "echo \"UPDATE exercises SET cue='mutant1';\" >> \"$MIGRATION_FILE\""

# Mutant 2: Lower-case un-scoped UPDATE
test_mutant "2: Lower-case un-scoped UPDATE" \
  "echo \"update exercises set cue='mutant2';\" >> \"$MIGRATION_FILE\""

# Mutant 3: Raw dumbbell ID in cue
test_mutant "3: Raw dumbbell ID" \
  "sed -i \"s/ with Dumbbell\./ with dumbbell\./\" \"$MIGRATION_FILE\""

# Mutant 4: Upper-body cue rewritten (add a fake update for an upper-body exercise)
test_mutant "4: Upper-body cue rewritten" \
  "echo \"UPDATE exercises SET cue='Mutated upper body' WHERE slug='barbell-curl';\" >> \"$MIGRATION_FILE\""

# Mutant 5: Wrong muscle in a cue
test_mutant "5: Wrong muscle" \
  "sed -i \"s/targeting abs/targeting biceps/\" \"$MIGRATION_FILE\" | head -1"

# Mutant 6: Lowercase (not capitalized)
test_mutant "6: Lowercase cue" \
  "sed -i \"s/Compound cardio/compound cardio/\" \"$MIGRATION_FILE\""

# Mutant 7: Non-idempotent (matches 2 rows)
test_mutant "7: Non-idempotent UPDATE" \
  "sed -i \"s/WHERE slug = 'barbell-squat'/WHERE slug LIKE 'barbell-%'/\" \"$MIGRATION_FILE\""

echo ""
echo "All mutants caught successfully!"
