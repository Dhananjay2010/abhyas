#!/usr/bin/env bash
# Mutant test for rest-day-resume-button
set -euo pipefail

echo "=== Mutant test: rest-day Resume showSwap"
echo

HELPER="src/lib/today/rest-day-resume.ts"

if [ ! -f "$HELPER" ]; then
  echo "ERROR: $HELPER not found"
  exit 1
fi

# Back up original
cp "$HELPER" "$HELPER.bak"

trap 'mv "$HELPER.bak" "$HELPER"' EXIT

echo "Injecting mutant: showSwap always TRUE"
sed -i.mut 's/showSwap: false,/showSwap: true, \/\/ MUTANT/' "$HELPER"

echo
npx tsx scripts/test-rest-day-resume-button.ts
STATUS=$?

if [ $STATUS -eq 0 ]; then
  echo
  echo "❌ MUTANT SURVIVED (test should have failed)"
  exit 1
else
  echo
  echo "✅ Mutant KILLED (test detected the bug)"
  exit 0
fi
