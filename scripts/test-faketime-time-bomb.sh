#!/bin/bash
set -e

echo "=== Testing Time Bomb Fix with faketime ==="
echo ""

# Test dates:
# 1. 2026-11-02 (8 days after FIXED_TIME 2026-10-25)
# 2. 2027-03-15 (142 days after FIXED_TIME)
# Timezones: UTC and Asia/Kolkata

TESTS=(
  "test:signout-button-clear"
  "test:today-signout-clears"
  "test:signout-h1-never-delete"
)

DATES=(
  "2026-11-02 00:00:00"
  "2027-03-15 00:00:00"
)

TIMEZONES=(
  "UTC"
  "Asia/Kolkata"
)

ALL_PASSED=0

for TEST in "${TESTS[@]}"; do
  for DATE in "${DATES[@]}"; do
    for TZ in "${TIMEZONES[@]}"; do
      echo "Running $TEST at $DATE ($TZ)..."
      
      if TZ=$TZ faketime "$DATE" npm run "$TEST" > /tmp/faketime-test.txt 2>&1; then
        echo "  ✓ PASSED"
      else
        echo "  ❌ FAILED"
        tail -20 /tmp/faketime-test.txt
        ALL_PASSED=1
      fi
      echo ""
    done
  done
done

if [ $ALL_PASSED -eq 0 ]; then
  echo "✅ All faketime tests passed"
  exit 0
else
  echo "❌ Some faketime tests failed"
  exit 1
fi
