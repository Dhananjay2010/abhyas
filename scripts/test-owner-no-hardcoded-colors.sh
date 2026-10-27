#!/usr/bin/env bash
# Test: no hex color literals in owner UI code (outside placeholder/value attributes)
# Ensures branding preview uses CSS variables, not hardcoded colors

set -euo pipefail

echo "Testing: no hex color literals in src/app/owner/** (outside placeholder/value attributes)"

# Find all hex color patterns in owner directory
hex_matches=$(grep -rn "#[0-9a-fA-F]\{6\}" src/app/owner/ || true)

if [ -z "$hex_matches" ]; then
  echo "✅ No hex literals found"
  exit 0
fi

# Check each match to see if it's in an allowed context
allowed_contexts=(
  'placeholder='
  'value='
  'error:'
  'Error:'
  '// '
  '* '
  'e.g.'
)

violations=()
while IFS= read -r line; do
  allowed=false
  for context in "${allowed_contexts[@]}"; do
    if echo "$line" | grep -q "$context"; then
      allowed=true
      break
    fi
  done
  
  if [ "$allowed" = false ]; then
    violations+=("$line")
  fi
done <<< "$hex_matches"

if [ ${#violations[@]} -eq 0 ]; then
  echo "✅ All hex literals are in allowed contexts (placeholder, value, error messages, comments)"
  exit 0
fi

echo "❌ Found hex color literals outside allowed contexts:"
printf '%s\n' "${violations[@]}"
echo ""
echo "Hex literals are only allowed in:"
echo "  - placeholder attributes"
echo "  - value attributes (user input)"
echo "  - error messages"
echo "  - comments"
echo ""
echo "For preview/UI colors, use CSS custom properties:"
echo "  - var(--color-accent)"
echo "  - var(--color-accent-hover)"
echo "  - var(--color-accent-fg)"
exit 1
