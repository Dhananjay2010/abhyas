#!/bin/bash
# Hand mutants for runtime gym branding
# Each mutant should be killed by at least one existing test

set -e

echo "=== Runtime Branding Mutant Testing ==="
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

# Mutant 1: Always return base brand
echo "MUTANT 1: Always return base brand"
cat > src/lib/runtime-brand.ts << 'EOF'
import { cache } from "react";
import { headers } from "next/headers";
import { branding, type Brand } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";
import { getGymBrand } from "@/lib/gym-brand";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export async function resolveBrandForHost(
  supabase: SupabaseClient<Database>,
  host: string | null,
  base: Brand,
  fetchGymBrand: (gymId: string) => Promise<Partial<Brand>> = getGymBrand
): Promise<Brand> {
  // MUTANT: Always return base
  return base;
}

export const getRequestBrand = cache(async (): Promise<Brand> => {
  const headersList = await headers();
  const host = headersList.get("host");
  const supabase = await createClient();
  
  return resolveBrandForHost(supabase, host, branding);
});

export function mergeBrand(base: Brand, partial: Partial<Brand>): Brand {
  const merged = { ...base };
  
  if (partial.id) merged.id = partial.id;
  if (partial.name && partial.name.length >= 2 && partial.name.length <= 100) {
    merged.name = partial.name;
  }
  
  if (partial.logo) {
    const logoStr = String(partial.logo);
    if (logoStr.startsWith("https://") || logoStr.startsWith("/storage/")) {
      merged.logo = logoStr;
    }
  }
  
  if (partial.colors) {
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    merged.colors = { ...base.colors };
    
    if (partial.colors.accent && hexRegex.test(partial.colors.accent)) {
      merged.colors.accent = partial.colors.accent;
    }
    if (partial.colors.accentHover && hexRegex.test(partial.colors.accentHover)) {
      merged.colors.accentHover = partial.colors.accentHover;
    }
    if (partial.colors.accentFg && hexRegex.test(partial.colors.accentFg)) {
      merged.colors.accentFg = partial.colors.accentFg;
    }
  }
  
  return merged;
}

export function getBrandCssVariablesForBrand(brand: Brand): string {
  return `--color-accent: ${brand.colors.accent}; --color-accent-hover: ${brand.colors.accentHover}; --color-accent-fg: ${brand.colors.accentFg};`;
}
EOF

if npm run test:runtime-branding-resolver 2>&1 | grep -q "FAIL"; then
  restore_and_report "Always return base brand" "fail" "test:runtime-branding-resolver"
else
  restore_and_report "Always return base brand" "pass" ""
fi

# Mutant 2: Ignore verified = true
echo "MUTANT 2: Ignore verified = true in domain resolution"
sed -i 's/verified: true/verified: false/g' src/lib/runtime-brand.ts

if npm run test:runtime-branding-resolver 2>&1 | grep -q "FAIL"; then
  restore_and_report "Ignore verified = true" "fail" "test:runtime-branding-resolver (verified domain test)"
else
  restore_and_report "Ignore verified = true" "pass" ""
fi

# Mutant 3: Drop accent_color (accentHover)
echo "MUTANT 3: Drop accent_color mapping"
sed -i '/accentHover:/d' src/lib/runtime-brand.ts

if npm run test:runtime-branding-resolver 2>&1 | grep -q "FAIL.*accentHover"; then
  restore_and_report "Drop accent_color" "fail" "test:runtime-branding-resolver (accent_color maps to accentHover)"
else
  restore_and_report "Drop accent_color" "pass" ""
fi

# Mutant 4: Skip accessibleTextColor (use fixed #000000)
echo "MUTANT 4: Skip accessibleTextColor (fixed #000000)"
sed -i 's/accessibleTextColor([^)]*))/#000000/g' src/lib/runtime-brand.ts

if npm run test:runtime-branding 2>&1 | grep -q "FAIL"; then
  restore_and_report "Skip accessibleTextColor" "fail" "test:runtime-branding (accentFg contrast test)"
else
  restore_and_report "Skip accessibleTextColor" "pass" ""
fi

# Mutant 5: Never show the notice
echo "MUTANT 5: Never show the notice"
sed -i 's/const shouldShow =/const shouldShow = false \&\&/g' src/components/host-wins-notice.tsx

if npm run test:host-wins-notice 2>&1 | grep -q "FAIL"; then
  restore_and_report "Never show notice" "fail" "test:host-wins-notice (Notice shown when gyms differ)"
else
  restore_and_report "Never show notice" "pass" ""
fi

# Mutant 6: Always show the notice
echo "MUTANT 6: Always show the notice"
sed -i 's/const shouldShow =/const shouldShow = true ||/g' src/components/host-wins-notice.tsx

if npm run test:host-wins-notice 2>&1 | grep -q "FAIL"; then
  restore_and_report "Always show notice" "fail" "test:host-wins-notice (Notice not shown when...)"
else
  restore_and_report "Always show notice" "pass" ""
fi

# Mutant 7: Host lowercasing removed
echo "MUTANT 7: Host normalisation (lowercasing) removed"
sed -i 's/\.toLowerCase()//g' src/lib/runtime-brand.ts

if npm run test:runtime-branding-resolver 2>&1 | grep -q "FAIL"; then
  restore_and_report "Host lowercasing removed" "fail" "test:runtime-branding-resolver (Uppercase host resolves)"
else
  restore_and_report "Host lowercasing removed" "pass" ""
fi

# Final restore
cp /tmp/runtime-brand.ts.orig src/lib/runtime-brand.ts
cp /tmp/host-wins-notice.tsx.orig src/components/host-wins-notice.tsx

echo "=== Mutant Testing Complete ==="
if [ $failures -gt 0 ]; then
  echo "❌ $failures mutant(s) survived (tests need improvement)"
  exit 1
else
  echo "✅ All 7 mutants were killed by existing tests"
  exit 0
fi
