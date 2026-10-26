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
npm run test:mutant-pb-toast
echo
npm run test:mutant-wire-logged-sets
echo
npm run test:mutant-compute-done-days

echo
echo "✅ All mutant tests passed"
