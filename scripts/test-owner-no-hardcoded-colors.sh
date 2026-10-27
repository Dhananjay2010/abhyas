#!/usr/bin/env bash
set -euo pipefail

echo "Testing: no hex color literals in src/app/owner/** (outside placeholder attributes)"

if [ ! -d "src/app/owner" ]; then
  echo "❌ FAIL: src/app/owner/ directory not found"
  exit 1
fi

is_allowed() {
  local content="$1"
  
  if ! echo "$content" | grep -qE '#[0-9a-fA-F]{3,6}|rgb|hsl'; then
    return 0
  fi
  
  # Skip comments (but NOT lines ending in */)
  if echo "$content" | grep -qE '^\s*//' || echo "$content" | grep -qE '^\s*/\*'; then
    return 0
  fi
  
  if echo "$content" | grep -qF 'placeholder='; then
    return 0
  fi
  
  # Reject value={...} if it contains ANY color literal inside braces
  if echo "$content" | grep -qE 'value\s*=\s*\{[^}]*#[0-9a-fA-F]{3,6}'; then
    return 1
  fi
  if echo "$content" | grep -qE 'value\s*=\s*\{[^}]*(rgb|hsl)'; then
    return 1
  fi
  
  if echo "$content" | grep -qE 'errcode|[Ee]rror:'; then
    return 0
  fi
  
  if echo "$content" | grep -qE 'BRND[0-9]'; then
    return 0
  fi
  
  return 1
}

hex_matches=$(grep -Hn "#[0-9a-fA-F]\{3,6\}" src/app/owner/ || true)
color_fn_matches=$(grep -Hn -E "(rgb|rgba|hsl|hsla)\s*\(" src/app/owner/ || true)
all_matches=$(echo -e "$hex_matches\n$color_fn_matches" | grep -v "^$" || true)

if [ -z "$all_matches" ]; then
  echo "✅ No color literals found"
  exit 0
fi

violations=()
while IFS= read -r line; do
  if [ -z "$line" ]; then
    continue
  fi
  
  content=$(echo "$line" | cut -d: -f2-)
  
  if ! is_allowed "$content"; then
    violations+=("$line")
  fi
done <<< "$all_matches"

if [ ${#violations[@]} -eq 0 ]; then
  echo "✅ All color literals are in allowed contexts"
  TEST_RESULT=0
else
  echo "❌ Found ${#violations[@]} color literal(s) outside allowed contexts:"
  printf '%s\n' "${violations[@]}"
  TEST_RESULT=1
fi

echo
echo "Running self-test..."

SELF_TEST_DIR=$(mktemp -d)
trap "rm -rf $SELF_TEST_DIR" EXIT

mkdir -p "$SELF_TEST_DIR/src/app/owner"

cat > "$SELF_TEST_DIR/src/app/owner/test.tsx" << 'VIOLATIONS'
export function Test() {
  const hardcoded1 = { color: "#FF0000" };
  const hardcoded2 = "bg-[#FF0000]";
  const hardcoded3 = "#f00";
  const hardcoded4 = "rgb(255, 0, 0)";
  const hardcoded5 = "hsl(0, 100%, 50%)";
  const note = "Use e.g. #AABBCC for primary";
  const bypass1 = <input value="#FF0000" />;
  const bypass3 = { color: "#FF0000" }; /* note */
  return <div>Test</div>;
}
VIOLATIONS

violations_found=()
while IFS= read -r line; do
  if [ -z "$line" ]; then
    continue
  fi
  
  content=$(echo "$line" | cut -d: -f2-)
  
  if ! is_allowed "$content"; then
    violations_found+=("$line")
  fi
done <<< "$(grep -Hn -E '#[0-9a-fA-F]{3,6}|rgb|hsl' "$SELF_TEST_DIR/src/app/owner/test.tsx" || true)"

EXPECTED_VIOLATIONS=8
if [ ${#violations_found[@]} -ne $EXPECTED_VIOLATIONS ]; then
  echo "❌ SELF-TEST FAILED: Expected $EXPECTED_VIOLATIONS violations, found ${#violations_found[@]}"
  exit 1
else
  echo "✅ Self-test passed: $EXPECTED_VIOLATIONS violations detected"
fi

exit $TEST_RESULT
