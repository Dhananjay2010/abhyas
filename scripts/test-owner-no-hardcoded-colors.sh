#!/usr/bin/env bash
# Test: no hex color literals in owner UI code (outside placeholder/value attributes)
# Ensures branding preview uses CSS variables, not hardcoded colors

set -euo pipefail

echo "Testing: no hex color literals in src/app/owner/** (outside placeholder/value attributes)"

# Verify directory exists (fail early if it doesn't - MED-3d requirement)
if [ ! -d "src/app/owner" ]; then
  echo "❌ FAIL: src/app/owner/ directory not found"
  echo "   This test requires the owner branding feature to be present"
  exit 1
fi

# Find all hex color patterns (#RRGGBB and #RGB) in owner directory
hex_matches=$(grep -rn "#[0-9a-fA-F]\{3,6\}" src/app/owner/ || true)

# Also check for rgb(), rgba(), hsl(), hsla() color functions
color_fn_matches=$(grep -rn -E "(rgb|rgba|hsl|hsla)\s*\(" src/app/owner/ || true)

all_matches=$(echo -e "$hex_matches\n$color_fn_matches" | grep -v "^$" || true)

if [ -z "$all_matches" ]; then
  echo "✅ No color literals found"
  exit 0
fi

# Check each match to see if it's in an allowed context
# Use fixed strings for literal matching (not ERE patterns)
allowed_contexts_literal=(
  'placeholder='
  'value='
  'error:'
  'Error:'
  'errcode'
  'e.g.'
)

# Use anchored patterns for comment detection
allowed_contexts_pattern=(
  '^\s*//'     # Line comments starting with //
  '^\s*\*'     # Block comment lines starting with *
  '/\*'        # Block comment start
  'BRND[0-9]'  # Error code references
)

violations=()
while IFS= read -r line; do
  if [ -z "$line" ]; then
    continue
  fi
  
  allowed=false
  
  # Check literal contexts with grep -F (fixed string)
  for context in "${allowed_contexts_literal[@]}"; do
    if echo "$line" | grep -qF "$context"; then
      allowed=true
      break
    fi
  done
  
  # If not allowed yet, check pattern contexts with grep -E
  if [ "$allowed" = false ]; then
    for pattern in "${allowed_contexts_pattern[@]}"; do
      if echo "$line" | grep -qE "$pattern"; then
        allowed=true
        break
      fi
    done
  fi
  
  if [ "$allowed" = false ]; then
    violations+=("$line")
  fi
done <<< "$all_matches"

# Store result for later
TEST_RESULT=0
if [ ${#violations[@]} -eq 0 ]; then
  echo "✅ All color literals are in allowed contexts (placeholder, value, error messages, comments)"
else
  echo "❌ Found color literals outside allowed contexts:"
  printf '%s\n' "${violations[@]}"
  echo ""
  echo "Color literals are only allowed in:"
  echo "  - placeholder attributes"
  echo "  - value attributes (user input)"
  echo "  - error messages and error codes"
  echo "  - comments"
  echo ""
  echo "For preview/UI colors, use CSS custom properties:"
  echo "  - var(--color-accent)"
  echo "  - var(--color-accent-hover)"
  echo "  - var(--color-accent-fg)"
  TEST_RESULT=1
fi

# Self-test: Verify the test can actually detect violations
echo
echo "Running self-test: verify detection of planted violations..."

SELF_TEST_DIR=$(mktemp -d)
trap "rm -rf $SELF_TEST_DIR" EXIT

mkdir -p "$SELF_TEST_DIR/src/app/owner"

# Plant 6 different violation types
cat > "$SELF_TEST_DIR/src/app/owner/test.tsx" << 'VIOLATIONS'
export function Test() {
  const hardcoded1 = { color: "#FF0000" };  // violation: direct hex
  const hardcoded2 = "bg-[#FF0000]";        // violation: Tailwind arbitrary
  const hardcoded3 = "#f00";                // violation: 3-digit hex
  const hardcoded4 = "rgb(255, 0, 0)";      // violation: rgb()
  const hardcoded5 = "hsl(0, 100%, 50%)";   // violation: hsl()
  // This is allowed e.g. for documentation
  return <div>Test</div>;
}
VIOLATIONS

SELF_TEST_PASSED=true

# Run the detection logic on the self-test dir
cd "$SELF_TEST_DIR"
hex_matches=$(grep -rn "#[0-9a-fA-F]\{3,6\}" src/app/owner/ || true)
color_fn_matches=$(grep -rn -E "(rgb|rgba|hsl|hsla)\s*\(" src/app/owner/ || true)
all_matches=$(echo -e "$hex_matches\n$color_fn_matches" | grep -v "^$" || true)

violations_found=()
while IFS= read -r line; do
  if [ -z "$line" ]; then
    continue
  fi
  
  allowed=false
  
  for context in "${allowed_contexts_literal[@]}"; do
    if echo "$line" | grep -qF "$context"; then
      allowed=true
      break
    fi
  done
  
  if [ "$allowed" = false ]; then
    for pattern in "${allowed_contexts_pattern[@]}"; do
      if echo "$line" | grep -qE "$pattern"; then
        allowed=true
        break
      fi
    done
  fi
  
  if [ "$allowed" = false ]; then
    violations_found+=("$line")
  fi
done <<< "$all_matches"

cd - > /dev/null

# Verify all 5 violations were detected (e.g. line is allowed)
EXPECTED_VIOLATIONS=5
if [ ${#violations_found[@]} -ne $EXPECTED_VIOLATIONS ]; then
  echo "❌ SELF-TEST FAILED: Expected $EXPECTED_VIOLATIONS violations, found ${#violations_found[@]}"
  printf '  Found: %s\n' "${violations_found[@]}"
  SELF_TEST_PASSED=false
fi

# Verify specific patterns were caught
if [ "$SELF_TEST_PASSED" = true ]; then
  must_detect=('#FF0000' 'bg-[#FF0000]' '#f00' 'rgb(' 'hsl(')
  for pattern in "${must_detect[@]}"; do
    found=false
    for violation in "${violations_found[@]}"; do
      if echo "$violation" | grep -qF "$pattern"; then
        found=true
        break
      fi
    done
    if [ "$found" = false ]; then
      echo "❌ SELF-TEST FAILED: Did not detect planted violation: $pattern"
      SELF_TEST_PASSED=false
    fi
  done
fi

if [ "$SELF_TEST_PASSED" = true ]; then
  echo "✅ Self-test passed: all planted violations detected"
else
  echo "❌ Self-test failed: detection logic is broken"
  exit 1
fi

exit $TEST_RESULT
