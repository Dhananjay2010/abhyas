#!/bin/bash
# Hand mutants for runtime gym branding (3-tier resolution with contrast guard)
# Each mutant should be killed by at least one existing test

set -e

echo "=== Runtime Branding Mutant Testing (3-Tier + Contrast) ==="
echo ""

# Save original files
cp src/lib/runtime-brand.ts /tmp/runtime-brand.ts.orig
cp src/components/host-wins-notice.tsx /tmp/host-wins-notice.tsx.orig

failures=0

# Helper to restore and report
restore_and_report() {
  local mutant=$1
  local result=$2
  local test=$3
  
  cp /tmp/runtime-brand.ts.orig src/lib/runtime-brand.ts
  cp /tmp/host-wins-notice.tsx.orig src/components/host-wins-notice.tsx
  
  if [ "$result" = "pass" ]; then
    echo "❌ MUTANT SURVIVED: $mutant"
    echo "   No test killed this mutant!"
    failures=$((failures + 1))
  else
    echo "✅ KILLED: $mutant"
    echo "   Killed by: $test"
  fi
  echo ""
}

# Mutant 1: Skip member fallback (go straight to base)
echo "MUTANT 1: Skip member fallback tier"
sed -i '/Tier 2: User.*active gym membership/,/Tier 3: Base brand/c\  \/\/ Tier 2: MUTANT - SKIPPED\n\n  \/\/ Tier 3: Base brand' src/lib/runtime-brand.ts

if npm run test:runtime-brand-3-tier 2>&1 | grep -q "FAIL.*Member fallback"; then
  restore_and_report "Skip member fallback" "fail" "test:runtime-brand-3-tier"
else
  restore_and_report "Skip member fallback" "pass" ""
fi

# Mutant 2: Use member gym even on mapped host (wrong tier priority)
echo "MUTANT 2: Use member gym even on mapped host"
sed -i 's/\/\/ Tier 2: User.*active gym membership/\/\/ MUTANT: Tier 2 BEFORE Tier 1\n  if (userId) {\n    try {\n      const membership = await getUserGymMembership(supabase, userId);\n      if (membership) {\n        const gymBrand = await fetchGymBrand(membership.gymId);\n        const brand = mergeBrand(base, gymBrand);\n        return { brand, gymId: membership.gymId, gymName: membership.gymName, tier: "member" as const };\n      }\n    } catch {}\n  }\n\n  \/\/ Tier 1: Host/g' src/lib/runtime-brand.ts

if npm run test:runtime-brand-3-tier 2>&1 | grep -q "FAIL"; then
  restore_and_report "Use member gym on mapped host" "fail" "test:runtime-brand-3-tier (tier order)"
else
  restore_and_report "Use member gym on mapped host" "pass" ""
fi

# Mutant 3: Remove contrast guard
echo "MUTANT 3: Remove contrast guard"
sed -i 's/const ratio = contrastRatio.*/const ratio = 99.0;/g' src/lib/runtime-brand.ts
sed -i 's/if (ratio >= 3.0)/if (true)/g' src/lib/runtime-brand.ts

if npm run test:runtime-brand-3-tier 2>&1 | grep -q "FAIL.*contrast"; then
  restore_and_report "Remove contrast guard" "fail" "test:runtime-brand-3-tier (contrast guard tests)"
else
  restore_and_report "Remove contrast guard" "pass" ""
fi

# Mutant 4: Ignore verified = true (accept unverified domains)
echo "MUTANT 4: Ignore verified = true"
sed -i 's/if (resolution.verified && resolution.gym_id)/if (resolution.gym_id)/g' src/lib/runtime-brand.ts

if npm run test:runtime-branding-resolver 2>&1 | grep -q "FAIL"; then
  restore_and_report "Ignore verified = true" "fail" "test:runtime-branding-resolver (unverified test)"
else
  restore_and_report "Ignore verified = true" "pass" ""
fi

# Mutant 5: Drop accent_color mapping
echo "MUTANT 5: Drop accent_color (accentHover)"
sed -i '/accentHover.*partial.colors.accentHover/d' src/lib/runtime-brand.ts

if npm run test:runtime-brand-3-tier 2>&1 | grep -q "FAIL.*accentHover"; then
  restore_and_report "Drop accent_color" "fail" "test:runtime-brand-3-tier (accent_color maps to accentHover)"
else
  restore_and_report "Drop accent_color" "pass" ""
fi

# Mutant 6: Never show the notice
echo "MUTANT 6: Never show the notice"
sed -i 's/const shouldShow =/const shouldShow = false \&\&/g' src/components/host-wins-notice.tsx

if npm run test:host-wins-notice 2>&1 | grep -q "FAIL"; then
  restore_and_report "Never show notice" "fail" "test:host-wins-notice (Notice shown when gyms differ)"
else
  restore_and_report "Never show notice" "pass" ""
fi

# Mutant 7: Always show the notice
echo "MUTANT 7: Always show the notice"
sed -i 's/const shouldShow =/const shouldShow = true ||/g' src/components/host-wins-notice.tsx

if npm run test:host-wins-notice 2>&1 | grep -q "FAIL"; then
  restore_and_report "Always show notice" "fail" "test:host-wins-notice (Notice not shown when...)"
else
  restore_and_report "Always show notice" "pass" ""
fi

# Mutant 8: Host lowercasing removed
echo "MUTANT 8: Host normalisation (lowercasing) removed"
sed -i 's/\.toLowerCase()//g' src/lib/runtime-brand.ts

if npm run test:runtime-branding-resolver 2>&1 | grep -q "FAIL"; then
  restore_and_report "Host lowercasing removed" "fail" "test:runtime-branding-resolver (Uppercase host resolves)"
else
  restore_and_report "Host lowercasing removed" "pass" ""
fi

# Mutant 9: Hard-code app background instead of reading from base.colors.bg
echo "MUTANT 9: Hard-coded app background (not from base)"
sed -i 's/const appBg = base.colors.bg;/const appBg = "#000000";/g' src/lib/runtime-brand.ts

# This mutant is subtle - it would change the contrast calculation slightly
# A proper test would verify the exact color used, but for now we check the concept
if npm run test:runtime-brand-3-tier 2>&1 | grep -q "All tests passed"; then
  restore_and_report "Hard-coded app background" "pass" ""
else
  restore_and_report "Hard-coded app background" "fail" "test:runtime-brand-3-tier (verifies contrast against base.colors.bg)"
fi

# Final restore
cp /tmp/runtime-brand.ts.orig src/lib/runtime-brand.ts
cp /tmp/host-wins-notice.tsx.orig src/components/host-wins-notice.tsx

echo "=== Mutant Testing Complete ==="
if [ $failures -gt 0 ]; then
  echo "❌ $failures mutant(s) survived (tests need improvement)"
  exit 1
else
  echo "✅ All 9 mutants were killed by existing tests"
  exit 0
fi
