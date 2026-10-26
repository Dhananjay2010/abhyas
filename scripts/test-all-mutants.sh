#!/usr/bin/env bash
set -e

echo "Running all mutant tests..."
echo

npm run test:mutant-session-summary
echo
npm run test:mutant-week-done
echo
npm run test:mutant-logged-sets
echo
npm run test:mutant-volume-lifted

echo
echo "✅ All mutant tests passed"
