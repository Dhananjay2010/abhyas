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

# Plant all 6 violations from QA report exactly as listed:
# color:"#FF0000", bg-[#FF0000], #f00, rgb(), hsl(), and a line with e.g.
cat > "$SELF_TEST_DIR/src/app/owner/test.tsx" << 'VIOLATIONS'
export function Test() {
  const hardcoded1 = { color: "#FF0000" };  // violation 1: color:"#FF0000"
  const hardcoded2 = "bg-[#FF0000]";        // violation 2: bg-[#FF0000]
  const hardcoded3 = "#f00";                // violation 3: #f00
  const hardcoded4 = "rgb(255, 0, 0)";      // violation 4: rgb()
  const hardcoded5 = "hsl(0, 100%, 50%)";   // violation 5: hsl()
  const note = "Use e.g. #AABBCC for primary";  // violation 6: e.g. in code with hex
  // This comment is allowed for documentation e.g. #123456
  return <div>Test</div>;
}
VIOLATIONS

# Also test a legitimate allowed context (comment line)
cat > "$SELF_TEST_DIR/src/app/owner/allowed.tsx" << 'ALLOWED'
export function Allowed() {
  // This comment mentions #FF0000 and should be allowed
  return <div>Test</div>;
}
ALLOWED

SELF_TEST_PASSED=true

# Run the detection logic on the self-test dir
cd "$SELF_TEST_DIR"
hex_matches=$(grep -rn "#[0-9a-fA-F]\{3,6\}" src/app/owner/ || true)
color_fn_matches=$(grep -rn -E "(rgb|rgba|hsl|hsla)\s*\(" src/app/owner/ || true)
all_matches=$(echo -e "$hex_matches\n$color_fn_matches" | grep -v "^$" || true)

violations_found=()
allowed_found=()
while IFS= read -r line; do
  if [ -z "$line" ]; then
    continue
  fi
  
  # Extract the actual code content (everything after the line number)
  # grep -n output format: "filepath:linenum:content"
  # Extract content after the second colon
  content=$(echo "$line" | cut -d':' -f3-)
  
  allowed=false
  
  # Check literal contexts
  for context in "${allowed_contexts_literal[@]}"; do
    if echo "$content" | grep -qF "$context"; then
      allowed=true
      break
    fi
  done
  
  # Check pattern contexts (comment detection)
  if [ "$allowed" = false ]; then
    for pattern in "${allowed_contexts_pattern[@]}"; do
      if echo "$content" | grep -qE "$pattern"; then
        allowed=true
        break
      fi
    done
  fi
  
  if [ "$allowed" = false ]; then
    violations_found+=("$line")
  else
    # Track that we found an allowed line
    if echo "$line" | grep -q "allowed.tsx"; then
      allowed_found+=("$line")
    fi
  fi
done <<< "$all_matches"

cd - > /dev/null

# Verify all 6 violations were detected from test.tsx
EXPECTED_VIOLATIONS=6
if [ ${#violations_found[@]} -ne $EXPECTED_VIOLATIONS ]; then
  echo "❌ SELF-TEST FAILED: Expected $EXPECTED_VIOLATIONS violations, found ${#violations_found[@]}"
  printf '  Found: %s\n' "${violations_found[@]}"
  SELF_TEST_PASSED=false
fi

# Verify the allowed comment line exists in the matches (it should be in all_matches but not in violations)
# Count total lines mentioning allowed.tsx in all_matches
ALLOWED_LINE_COUNT=$(echo "$all_matches" | grep "allowed.tsx" | wc -l)
if [ "$ALLOWED_LINE_COUNT" -eq 0 ]; then
  echo "❌ SELF-TEST FAILED: Allowed comment file not detected at all (grep didn't find the hex in comment)"
  SELF_TEST_PASSED=false
elif [ ${#allowed_found[@]} -eq 0 ]; then
  echo "❌ SELF-TEST FAILED: Allowed comment was found by grep but not classified as allowed"
  SELF_TEST_PASSED=false
fi

# Verify all 6 specific patterns from QA report were caught
if [ "$SELF_TEST_PASSED" = true ]; then
  # First 5 are straightforward violations
  must_detect=('color:"#FF0000"' 'bg-[#FF0000]' '#f00' 'rgb(' 'hsl(')
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
  
  # 6th: e.g. in code (not a comment) should be caught
  found_eg=false
  for violation in "${violations_found[@]}"; do
    if echo "$violation" | grep -F "e.g." | grep -qF "test.tsx:7"; then
      found_eg=true
      break
    fi
  done
  if [ "$found_eg" = false ]; then
    echo "❌ SELF-TEST FAILED: Did not detect planted violation: e.g. line in code"
    SELF_TEST_PASSED=false
  fi
fi

# Verify the allowed comment was properly allowed
if [ "$SELF_TEST_PASSED" = true ]; then
  # The allowed.tsx comment should be in allowed_found, not violations_found
  found_in_violations=false
  for violation in "${violations_found[@]}"; do
    if echo "$violation" | grep -q "allowed.tsx.*comment"; then
      found_in_violations=true
      break
    fi
  done
  if [ "$found_in_violations" = true ]; then
    echo "❌ SELF-TEST FAILED: Legitimate comment was incorrectly flagged as violation"
    SELF_TEST_PASSED=false
  fi
fi

if [ "$SELF_TEST_PASSED" = true ]; then
  echo "✅ Self-test passed: all planted violations detected"
else
  echo "❌ Self-test failed: detection logic is broken"
  exit 1
fi

exit $TEST_RESULT
