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
allowed_contexts=(
  'placeholder='
  'value='
  'error:'
  'Error:'
  'errcode'
  '// '
  '* '
  '/*'
  'e.g.'
  'BRND[0-9]'
)

violations=()
while IFS= read -r line; do
  if [ -z "$line" ]; then
    continue
  fi
  
  allowed=false
  for context in "${allowed_contexts[@]}"; do
    if echo "$line" | grep -qE "$context"; then
      allowed=true
      break
    fi
  done
  
  if [ "$allowed" = false ]; then
    violations+=("$line")
  fi
done <<< "$all_matches"

if [ ${#violations[@]} -eq 0 ]; then
  echo "✅ All color literals are in allowed contexts (placeholder, value, error messages, comments)"
  exit 0
fi

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
exit 1
