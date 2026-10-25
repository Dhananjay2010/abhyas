#!/bin/bash

# Fix remaining unit references in tests
for f in test-first-miss-two-miss-invariant.ts test-imperial-wording.ts test-load-grid.ts; do
  [ -f "$f" ] || continue
  # Remove unit: from objects
  sed -i '/^\s*unit: /d' "$f"
  sed -i 's/, unit: "[^"]*"//' "$f"
  # Fix progressionInputsFromExercise calls with 2 args
  sed -i 's/progressionInputsFromExercise([^,]*, "[^"]*")/progressionInputsFromExercise(\1)/' "$f"
  # Fix unit property in type defs
  sed -i 's/unit: "kg" | "lb";//' "$f"
done

# Fix weight_at_failure_start_kg in test-h2-real-path-persistence.ts
sed -i 's/total_sessions: number;$/total_sessions: number;\n      weight_at_failure_start_kg: string;/' test-h2-real-path-persistence.ts

# Fix Partial<ProgressState> issue in test-exact-20-percent-cut-clamp.ts
sed -i 's/weightAtFailureStartKg?: number/weightAtFailureStartKg: number/' test-exact-20-percent-cut-clamp.ts

echo "Fixed final errors"
