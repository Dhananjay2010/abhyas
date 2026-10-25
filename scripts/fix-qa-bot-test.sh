#!/bin/bash
# Fix test-qa-bot-1-full-path.ts systematically

FILE="test-qa-bot-1-full-path.ts"

# Step 1: Remove userUnits/unit arguments from progressionInputsFromExercise
sed -i 's/progressionInputsFromExercise({ equipment_ids: \([^}]*\) }, "[^"]*")/progressionInputsFromExercise({ equipment_ids: \1 })/' "$FILE"
sed -i 's/progressionInputsFromExercise({ equipment_ids: \([^}]*\) }, null)/progressionInputsFromExercise({ equipment_ids: \1 })/' "$FILE"

# Step 2: Add weightAtFailureStartKg to ALL state objects (after totalSessions line)
sed -i '/totalSessions: \(stored?\.total_sessions\|progress\.total_sessions\)[^,]*,$/a\      weightAtFailureStartKg: null,' "$FILE"

# Step 3: Clean up any doubled commas
sed -i 's/,,/,/' "$FILE"

echo "Fixed test-qa-bot-1-full-path.ts"
