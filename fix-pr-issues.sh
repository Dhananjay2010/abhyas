#!/bin/bash
set -e

echo "Fixing PR issues..."

# Fix banned patterns in test-rest-day-swap-preselect-dom.tsx
echo "1. Fixing ! operator in test-rest-day-swap-preselect-dom.tsx"
cat > /tmp/fix1.txt << 'EOF'
    const swapButton = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent?.includes("Swap the day"));
    
    assert.ok(swapButton, "Should have 'Swap the day' button");
    
    await userEvent.click(swapButton);
EOF

# Apply the fix
sed -i '/await userEvent.click(swapButton!);/{
N
N
N
N
N
d
}' scripts/test-rest-day-swap-preselect-dom.tsx

# Now add the correct version before the next occurrence
sed -i '/const swapButton = Array.from(container.querySelectorAll/,/find(b => b.textContent/c\
    const swapButton = Array.from(container.querySelectorAll('"'button'"'))\
      .find(b => b.textContent?.includes("Swap the day"));\
    \
    assert.ok(swapButton, "Should have '"'Swap the day'"' button");\
    \
    await userEvent.click(swapButton);
' scripts/test-rest-day-swap-preselect-dom.tsx

echo "2. Updating test chain in package.json"
# The merge already happened, just verify
CHAIN_COUNT=$(grep -o 'npm run test:' package.json | wc -l)
echo "Current chain count: $CHAIN_COUNT"

echo "3. All done!"
echo "Manual steps remaining:"
echo "  - Extract collision resolution function"
echo "  - Update post-swap-collision test"
echo "  - Verify preselect test checks selection state"
echo "  - Check lint warnings"
