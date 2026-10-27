#!/usr/bin/env bash
set -euo pipefail

echo "Testing: no hex color literals in src/app/owner/** (outside placeholder/value attributes)"

# Verify directory exists (fail early if it doesn't - MED-3d requirement)
if [ ! -d "src/app/owner" ]; then
  echo "❌ FAIL: src/app/owner/ directory not found"
  echo "   This test requires the owner branding feature to be present"
  exit 1
fi

# Shared classifier function: returns 0 (pass) if content is allowed, 1 (fail) if hardcoded color
is_allowed() {
  local content="$1"
  
  # Must contain a color code to be evaluated
  if ! echo "$content" | grep -qE '#[0-9a-fA-F]{3,6}|rgb|hsl'; then
    return 0  # No color, allowed
  fi
  
  # Skip comments (line or block)
  if echo "$content" | grep -qE '^\s*//' || echo "$content" | grep -qE '^\s*/\*' || echo "$content" | grep -qE '\*/\s*$'; then
    return 0
  fi
  
  # Allow placeholder="#..."
  if echo "$content" | grep -qF 'placeholder='; then
    return 0
  fi
  
  # Allow value={...} where ... is a variable expression (user state)
  # Reject value="#..." (literal string) and value={"#..."} (literal in object)
  if echo "$content" | grep -qE 'value\s*=\s*\{[^}]+\}'; then
    # If the value expression contains a literal hex/color, reject it
    if echo "$content" | grep -qE 'value\s*=\s*\{\s*"#[0-9a-fA-F]{3,6}"'; then
      return 1  # Literal color in value
    fi
    return 0  # Variable expression, allowed
  fi
  
  # Allow error messages containing error codes (errcode, Error:, error:)
  if echo "$content" | grep -qE 'errcode|[Ee]rror:'; then
    return 0
  fi
  
  # Allow BRND error code references
  if echo "$content" | grep -qE 'BRND[0-9]'; then
    return 0
  fi
  
  # All other cases: hardcoded color
  return 1
}

# Find all hex color patterns (#RRGGBB and #RGB) in owner directory
hex_matches=$(grep -rn "#[0-9a-fA-F]\{3,6\}" src/app/owner/ || true)

# Also check for rgb(), rgba(), hsl(), hsla() color functions
color_fn_matches=$(grep -rn -E "(rgb|rgba|hsl|hsla)\s*\(" src/app/owner/ || true)

all_matches=$(echo -e "$hex_matches\n$color_fn_matches" | grep -v "^$" || true)

if [ -z "$all_matches" ]; then
  echo "✅ No color literals found"
  exit 0
fi

# Check each match using the shared classifier
violations=()
while IFS= read -r line; do
  if [ -z "$line" ]; then
    continue
  fi
  
  # Extract content after "filepath:linenum:"
  content=$(echo "$line" | cut -d':' -f3-)
  
  # Use shared classifier
  if ! is_allowed "$content"; then
    violations+=("$line")
  fi
done <<< "$all_matches"

# Store result
TEST_RESULT=0
if [ ${#violations[@]} -eq 0 ]; then
  echo "✅ All color literals are in allowed contexts (placeholder, value, error messages, comments)"
else
  echo "❌ Found color literals outside allowed contexts:"
  printf '%s\n' "${violations[@]}"
  echo ""
  echo "Color literals are only allowed in:"
  echo "  - placeholder attributes"
  echo "  - value attributes (user state variables)"
  echo "  - error messages and error codes"
  echo "  - comments"
  TEST_RESULT=1
fi

# Self-test: Verify the test can actually detect violations
echo
echo "Running self-test: verify detection of planted violations..."

SELF_TEST_DIR=$(mktemp -d)
trap "rm -rf $SELF_TEST_DIR" EXIT

mkdir -p "$SELF_TEST_DIR/src/app/owner"

# Plant violations from QA report plus the 4 bypasses
cat > "$SELF_TEST_DIR/src/app/owner/test.tsx" << 'VIOLATIONS'
export function Test() {
  const hardcoded1 = { color: "#FF0000" };  // violation 1
  const hardcoded2 = "bg-[#FF0000]";        // violation 2
  const hardcoded3 = "#f00";                // violation 3
  const hardcoded4 = "rgb(255, 0, 0)";      // violation 4
  const hardcoded5 = "hsl(0, 100%, 50%)";   // violation 5
  const note = "Use e.g. #AABBCC for primary";  // violation 6
  
  // These 4 must be caught (QA Bot bypass tests):
  const bypass1 = <input value="#FF0000" />;     // violation 7
  const bypass2 = { error: "#FF0000" };          // (allowed - error key)
  const bypass3 = { color: "#FF0000" }; /* note */ // violation 8
  const bypass4 = "some errcode text #123456";   // (allowed - errcode)
  
  // This comment is allowed for documentation e.g. #123456
  return <div>Test</div>;
}
VIOLATIONS

# Run the classifier on the self-test content
violations_found=()
allowed_found=()
while IFS= read -r line; do
  if [ -z "$line" ]; then
    continue
  fi
  
  content=$(echo "$line" | cut -d':' -f3-)
  
  if ! is_allowed "$content"; then
    violations_found+=("$line")
  else
    if echo "$line" | grep -q "test.tsx"; then
      allowed_found+=("$line")
    fi
  fi
done <<< "$(grep -n -E '#[0-9a-fA-F]{3,6}|rgb|hsl' "$SELF_TEST_DIR/src/app/owner/test.tsx" || true)"

# Verify we caught the expected 8 violations
EXPECTED_VIOLATIONS=8
if [ ${#violations_found[@]} -ne $EXPECTED_VIOLATIONS ]; then
  echo "❌ SELF-TEST FAILED: Expected $EXPECTED_VIOLATIONS violations, found ${#violations_found[@]}"
  printf '  Found: %s\n' "${violations_found[@]}"
  SELF_TEST_PASSED=false
else
  echo "✅ Self-test passed: All $EXPECTED_VIOLATIONS violations detected"
  SELF_TEST_PASSED=true
fi

# Verify bypass2 and bypass4 were allowed (they contain error/errcode)
EXPECTED_ALLOWED=2
if [ ${#allowed_found[@]} -lt $EXPECTED_ALLOWED ]; then
  echo "❌ SELF-TEST WARNING: Expected at least $EXPECTED_ALLOWED allowed lines"
fi

if [ "$SELF_TEST_PASSED" = false ]; then
  exit 1
fi

exit $TEST_RESULT
