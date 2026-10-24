#!/bin/bash
set -e

echo "Testing mutants to verify test catches them..."
echo ""

MIGRATION_FILE="supabase/migrations/20261025000011_catalogue_descriptions.sql"
PYTHON_FILE="scripts/build_exercise_seed.py"
BACKUP_MIGRATION="/tmp/migration_backup.sql"
BACKUP_PYTHON="/tmp/python_backup.py"

cp "$MIGRATION_FILE" "$BACKUP_MIGRATION"
cp "$PYTHON_FILE" "$BACKUP_PYTHON"

test_mutant() {
  local name="$1"
  local mutant_cmd="$2"
  local test_cmd="${3:-npm run test:catalogue-descriptions}"
  
  echo "Mutant $name:"
  eval "$mutant_cmd"
  
  if $test_cmd >/dev/null 2>&1; then
    echo "  ❌ MISSED - test passed when it should have failed"
    cp "$BACKUP_MIGRATION" "$MIGRATION_FILE"
    cp "$BACKUP_PYTHON" "$PYTHON_FILE"
    return 1
  else
    echo "  ✅ CAUGHT - test failed as expected"
    cp "$BACKUP_MIGRATION" "$MIGRATION_FILE"
    cp "$BACKUP_PYTHON" "$PYTHON_FILE"
    return 0
  fi
}

# Original 7 mutants
test_mutant "1: Un-scoped UPDATE" \
  "echo \"UPDATE exercises SET cue='mutant1';\" >> \"$MIGRATION_FILE\""

test_mutant "2: Lower-case un-scoped UPDATE" \
  "echo \"update exercises set cue='mutant2';\" >> \"$MIGRATION_FILE\""

test_mutant "3: Raw dumbbell ID" \
  "sed -i \"s/ with Dumbbell\./ with dumbbell\./\" \"$MIGRATION_FILE\""

test_mutant "4: Upper-body cue rewritten (real statement form)" \
  "echo -e \"-- Barbell Curl\nUPDATE exercises SET cue = 'Mutated upper body'\nWHERE slug = 'barbell-curl' AND cue = 'anything';\" >> \"$MIGRATION_FILE\""

test_mutant "5: Wrong muscle" \
  "sed -i \"s/targeting abs/targeting biceps/\" \"$MIGRATION_FILE\" | head -1"

test_mutant "6: Lowercase cue" \
  "sed -i \"s/Compound squat/compound squat/\" \"$MIGRATION_FILE\""

test_mutant "7: Scope widening (LIKE instead of =)" \
  "sed -i \"s/WHERE slug = 'barbell-squat'/WHERE slug LIKE 'barbell-%'/\" \"$MIGRATION_FILE\""

# New mutants from review
test_mutant "8: Well-formed upper-body rewrite (real statement form)" \
  "echo -e \"-- Barbell Bench Press\nUPDATE exercises SET cue = 'Compound push movement targeting chest with Barbell.'\nWHERE slug = 'barbell-bench-press' AND cue = 'Compound push movement targeting chest. Barbell.';\" >> \"$MIGRATION_FILE\""

test_mutant "9: Guard drop (goblet-squat)" \
  "sed -i \"s/WHERE slug = 'goblet-squat' AND cue = 'Compound push movement targeting quads. Kettlebell.'/WHERE slug = 'goblet-squat'/\" \"$MIGRATION_FILE\""

test_mutant "10: Cardio movement wording" \
  "sed -i \"s/Compound movement targeting/Compound cardio movement targeting/\" \"$MIGRATION_FILE\""

test_mutant "11: Python builder label change" \
  "sed -i 's/\"dumbbell\": \"Dumbbell\"/\"dumbbell\": \"Dumbbells\"/' scripts/build_exercise_seed.py" \
  "npm run test:cue-parity"

test_mutant "12: Warmup type change (unguarded)" \
  "echo -e \"\n-- Quad Stretch\nUPDATE warmup_exercises SET type = 'mobility'\nWHERE slug = 'quad-stretch' AND type = 'stretch';\" >> \"$MIGRATION_FILE\""

echo ""
echo "All mutants caught successfully!"
