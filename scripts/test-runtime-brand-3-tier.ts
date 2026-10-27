/**
 * Test: Runtime branding 3-tier resolution (host → member → base)
 *
 * Tests the complete resolution order with member fallback and contrast guard.
 */

import { branding } from "../src/lib/branding";
import { resolveBrand, mergeBrand } from "../src/lib/runtime-brand";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { contrastRatio } from "../src/lib/contrast";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

// Stub fetch for testing
function createStubFetch(data: Record<string, unknown[]>) {
  const calls: Array<{ url: string; body: unknown }> = [];
  
  const fetchImpl: typeof fetch = async (url, init) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    const bodyStr = init?.body;
    const body = bodyStr && typeof bodyStr === 'string' ? JSON.parse(bodyStr) : {};
    calls.push({ url: urlStr, body });
    
    // Check if this is a Supabase RPC call
    if (urlStr.includes('/rest/v1/rpc/')) {
      const funcName = urlStr.split('/rest/v1/rpc/')[1]?.split('?')[0] || '';
      const responseData = data[funcName] || [];
      
      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Fallback for other calls
    const funcName = body.name || '';
    const responseData = data[funcName] || [];
    
    return new Response(JSON.stringify({ data: responseData }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  
  return {
    calls,
    fetch: fetchImpl,
  };
}

async function main() {
  console.log("TEST: Tier 3 (base brand) - no host, no user");
  {
    const stub = createStubFetch({});
    const supabase = createSupabaseClient<Database>(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: stub.fetch },
      }
    );
    
    const mockFetch = async () => ({ name: 'Should not be called' });
    const result = await resolveBrand(supabase, null, null, branding, mockFetch);
    
    check("Tier is 'base'", result.tier === "base");
    check("Brand is base", JSON.stringify(result.brand) === JSON.stringify(branding));
    check("Gym ID is null", result.gymId === null);
  }
  console.log();

  console.log("TEST: Tier 1 (host wins) - verified domain with member of different gym");
  {
    const stub = createStubFetch({
      resolve_gym_by_host: [
        {
          gym_id: 'gym-b-id',
          gym_slug: 'gold-coast-iron',
          gym_name: 'Gold Coast Iron',
          verified: true,
        },
      ],
    });
    const supabase = createSupabaseClient<Database>(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: stub.fetch },
      }
    );
    
    const mockFetchGymBrand = async (gymId: string) => {
      if (gymId === 'gym-b-id') {
        return {
          name: 'Gold Coast Iron',
          colors: { accent: '#F59E0B', accentFg: '#000000' },
        };
      }
      if (gymId === 'gym-a-id') {
        return {
          name: 'Iron Temple',
          colors: { accent: '#1E40AF', accentFg: '#ffffff' },
        };
      }
      return {};
    };
    
    const memberGym = { gymId: 'gym-a-id', gymName: 'Iron Temple' };
    const result = await resolveBrand(supabase, 'goldcoastiron.com', memberGym, branding, mockFetchGymBrand);
    
    check("Tier is 'host' (not member)", result.tier === "host");
    check("Gym ID is gym-b-id (host wins)", result.gymId === 'gym-b-id');
    check("Gym name is Gold Coast Iron", result.gymName === 'Gold Coast Iron');
  }
  console.log();

  console.log("TEST: Tier 2 (member fallback) - unmapped host, member of Iron Temple");
  {
    const stub = createStubFetch({});
    const supabase = createSupabaseClient<Database>(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: stub.fetch },
      }
    );
    
    const mockFetchGymBrand = async (gymId: string) => {
      if (gymId === 'iron-temple-id') {
        return {
          name: 'Iron Temple',
          colors: { accent: '#1E40AF', accentFg: '#ffffff' },
        };
      }
      return {};
    };
    
    const memberGym = { gymId: 'iron-temple-id', gymName: 'Iron Temple' };
    const result = await resolveBrand(supabase, 'localhost', memberGym, branding, mockFetchGymBrand);
    
    check("Tier is 'member'", result.tier === "member");
    check("Gym ID is iron-temple-id", result.gymId === 'iron-temple-id');
    check("Gym name is Iron Temple", result.gymName === 'Iron Temple');
    check("Brand name is Iron Temple", result.brand.name === 'Iron Temple');
  }
  console.log();

  console.log("TEST: Member gym on mapped host - host still wins");
  {
    const stub = createStubFetch({
      resolve_gym_by_host: [
        {
          gym_id: 'gym-b-id',
          gym_slug: 'gold-coast-iron',
          gym_name: 'Gold Coast Iron',
          verified: true,
        },
      ],
    });
    const supabase = createSupabaseClient<Database>(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: stub.fetch },
      }
    );
    
    const mockFetchGymBrand = async (gymId: string) => {
      if (gymId === 'gym-b-id') {
        return { name: 'Gold Coast Iron', colors: { accent: '#F59E0B' } };
      }
      if (gymId === 'iron-temple-id') {
        return { name: 'Iron Temple', colors: { accent: '#1E40AF' } };
      }
      return {};
    };
    
    const memberGym = { gymId: 'iron-temple-id', gymName: 'Iron Temple' };
    const result = await resolveBrand(supabase, 'goldcoastiron.com', memberGym, branding, mockFetchGymBrand);
    
    check("Tier is 'host'", result.tier === "host");
    check("Gym ID is gym-b-id (not iron-temple-id)", result.gymId === 'gym-b-id');
    check("Brand name is Gold Coast Iron (not Iron Temple)", result.brand.name === 'Gold Coast Iron');
  }
  console.log();

  console.log("TEST: Contrast guard - OKLCH lightness adjustment");
  {
    const appBg = branding.colors.bg;  // #0a0c0e
    const lowBlue = '#1E40AF';          // ~2.25:1 contrast (< 3:1)
    const goodAmber = '#F59E0B';        // ~9.12:1 contrast (>= 3:1, accepted)
    
    const ratio2 = contrastRatio(lowBlue, appBg);
    const ratio3 = contrastRatio(goodAmber, appBg);
    
    check("Dark blue < 3:1", ratio2 < 3.0);
    check("Amber >= 3:1", ratio3 >= 3.0);
    
    // Test mergeBrand applies OKLCH adjustment
    const lowPartial = {
      colors: {
        accent: lowBlue,
        accentHover: lowBlue,
        accentFg: '#ffffff',
        bg: branding.colors.bg,
        surface: branding.colors.surface,
        surface2: branding.colors.surface2,
        border: branding.colors.border,
        fg: branding.colors.fg,
        muted: branding.colors.muted,
        success: branding.colors.success,
        warning: branding.colors.warning,
        warningFg: branding.colors.warningFg,
        danger: branding.colors.danger,
        chart: branding.colors.chart,
      },
    };
    
    const merged = mergeBrand(branding, lowPartial);
    check("Low contrast adjusted (not original)", merged.colors.accent !== lowBlue);
    check("Adjusted has >= 3:1 contrast", contrastRatio(merged.colors.accent, appBg) >= 3.0);
    const adjustedFg = merged.colors.accentFg;
    check("accentFg has >= 4.5:1 against adjusted", contrastRatio(adjustedFg, merged.colors.accent) >= 4.5);
    
    // Test good contrast accepted as-is
    const goodPartial = {
      colors: {
        accent: goodAmber,
        accentHover: goodAmber,
        accentFg: '#ffffff',
        bg: branding.colors.bg,
        surface: branding.colors.surface,
        surface2: branding.colors.surface2,
        border: branding.colors.border,
        fg: branding.colors.fg,
        muted: branding.colors.muted,
        success: branding.colors.success,
        warning: branding.colors.warning,
        warningFg: branding.colors.warningFg,
        danger: branding.colors.danger,
        chart: branding.colors.chart,
      },
    };
    
    const merged2 = mergeBrand(branding, goodPartial);
    check("Good contrast accepted as-is", merged2.colors.accent === goodAmber);
  }
  console.log();

  console.log("TEST: accent_color maps to accentHover (per gym-brand.ts)");
  {
    const partial = {
      name: 'Test Gym',
      colors: {
        accent: '#ff0000',
        accentHover: '#cc0000',
        accentFg: '#000000',
        bg: branding.colors.bg,
        surface: branding.colors.surface,
        surface2: branding.colors.surface2,
        border: branding.colors.border,
        fg: branding.colors.fg,
        muted: branding.colors.muted,
        success: branding.colors.success,
        warning: branding.colors.warning,
        warningFg: branding.colors.warningFg,
        danger: branding.colors.danger,
        chart: branding.colors.chart,
      },
    };
    
    const merged = mergeBrand(branding, partial);
    check("primary_color becomes accent", merged.colors.accent === '#ff0000');
    check("accent_color becomes accentHover", merged.colors.accentHover === '#cc0000');
  }
  console.log();

  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed\n`);
    process.exit(1);
  }

  console.log("\n✅ All tests passed\n");
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
