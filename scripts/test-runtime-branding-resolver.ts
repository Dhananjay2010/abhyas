/**
 * Test: Runtime gym branding - Real resolver tests with stubFetch
 *
 * Tests resolveBrand with real Supabase client and recording stubFetch:
 * (a) Unmapped host produces base brand (byte-identical CSS and metadata)
 * (b) Verified mapped host returns gym's colors, name, logo
 * (c) Unverified host returns base (verify RPCs called)
 * (d) RPC error returns base
 * (e) Host normalisation (uppercase, port) resolves correctly
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { branding, type Brand } from "../src/lib/branding";
import { resolveBrand, getBrandCssVariablesForBrand } from "../src/lib/runtime-brand";
import { getBrandCssVariables } from "../src/lib/branding";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

type FetchCall = {
  url: string;
  method: string;
  body?: string;
};

function createStubFetch(responses: Record<string, unknown>) {
  const calls: FetchCall[] = [];
  
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method || 'GET';
    const body = init?.body ? init.body.toString() : undefined;
    
    calls.push({ url, method, body });
    
    // Supabase RPC calls go to /rest/v1/rpc/{function_name}
    const rpcMatch = url.match(/\/rpc\/([^?]+)/);
    if (!rpcMatch) {
      return new Response(JSON.stringify({ error: 'Not an RPC call' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const rpcName = rpcMatch[1];
    
    // Return the stubbed response
    const response = responses[rpcName];
    if (response === undefined) {
      return new Response(JSON.stringify({ error: `RPC ${rpcName} not stubbed` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  
  return {
    fetch: fetchImpl,
    calls,
  };
}

async function main() {
  console.log("TEST: (a) Unmapped host produces base brand (byte-identical)");
  {
    const stub = createStubFetch({
      resolve_gym_by_host: [],
    });
    
    const supabase = createSupabaseClient<Database>(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: stub.fetch },
      }
    );
    
    const mockFetchBrand = async () => ({ name: 'Should not be called' });
    const resolution = await resolveBrand(supabase, 'unmapped.example.com', null, branding, mockFetchBrand);
    const result = resolution.brand;
    
    check("Tier is 'base'", resolution.tier === "base");
    check("Name unchanged", result.name === branding.name);
    check("Colors unchanged", result.colors.accent === branding.colors.accent);
    check("Result byte-identical to base", JSON.stringify(result) === JSON.stringify(branding));
    
    // Verify CSS is byte-identical
    const baseCss = getBrandCssVariables(branding);
    const resultCss = getBrandCssVariablesForBrand(result);
    check("CSS byte-identical", baseCss === resultCss);
    
    // Verify resolve_gym_by_host was called
    const resolveCall = stub.calls.find(c => c.url.includes('/rpc/resolve_gym_by_host'));
    check("resolve_gym_by_host called", resolveCall !== undefined);
  }
  console.log();

  console.log("TEST: (b) Verified mapped host returns gym's colors, name, logo");
  {
    const gymId = '12345678-1234-1234-1234-123456789abc';
    
    const stub = createStubFetch({
      resolve_gym_by_host: [
        {
          gym_id: gymId,
          gym_slug: 'fitcore',
          gym_name: 'FitCore Gym',
          // Note: verified field removed (migration 037 shape)
        },
      ],
    });
    
    const mockFetchBrand = async (id: string): Promise<Partial<Brand>> => {
      check("Correct gym ID passed", id === gymId);
      return {
        name: 'FitCore Gym',
        logo: 'https://example.com/logo.png',
        timezone: 'America/New_York',
        colors: {
          accent: '#3b82f6',
          accentHover: '#2563eb',
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
    };
    
    const supabase = createSupabaseClient<Database>(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: stub.fetch },
      }
    );
    
    const resolution = await resolveBrand(supabase, 'fitcore.example.com', null, branding, mockFetchBrand);
    const result = resolution.brand;
    
    check("Tier is 'host'", resolution.tier === "host");
    check("Name merged", result.name === 'FitCore Gym');
    check("Logo merged", result.logo === 'https://example.com/logo.png');
    // Timezone not merged at runtime (handled by gym-brand.ts getGymBrand)
    check("Primary color merged", result.colors.accent === '#3b82f6');
    check("Accent color merged", result.colors.accentHover === '#2563eb');
    // accentFg is computed via accessibleTextColor on the (potentially adjusted) accent
    check("accentFg merged", result.colors.accentFg === '#000000');
    
    // Verify resolve_gym_by_host was called
    const resolveCall = stub.calls.find(c => c.url.includes('/rpc/resolve_gym_by_host'));
    check("resolve_gym_by_host called", resolveCall !== undefined);
    
    // Assert p_host is normalized (lowercase)
    if (resolveCall?.body) {
      const bodyMatch = resolveCall.body.match(/"p_host"\s*:\s*"([^"]+)"/);
      if (bodyMatch) {
        const receivedHost = bodyMatch[1];
        check("p_host is lowercase", receivedHost === 'fitcore.example.com');
        check("p_host has no port", !receivedHost.includes(':'));
      }
    }
  }
  console.log();

  console.log("TEST: (c) Unverified host returns base");
  {
    const stub = createStubFetch({
      resolve_gym_by_host: [], // Empty = unverified
    });
    
    const supabase = createSupabaseClient<Database>(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: stub.fetch },
      }
    );
    
    let brandFetchCalled = false;
    const mockFetchBrand = async () => {
      brandFetchCalled = true;
      return {};
    };
    
    const resolution = await resolveBrand(supabase, 'unverified.example.com', null, branding, mockFetchBrand);
    const result = resolution.brand;
    
    check("Result identical to base", JSON.stringify(result) === JSON.stringify(branding));
    
    // Verify only resolve_gym_by_host was called, not the brand fetcher
    const resolveCall = stub.calls.find(c => c.url.includes('/rpc/resolve_gym_by_host'));
    check("resolve_gym_by_host called", resolveCall !== undefined);
    check("Brand fetcher NOT called", !brandFetchCalled);
  }
  console.log();

  console.log("TEST: (d) RPC error returns base");
  {
    const stub = createStubFetch({
      resolve_gym_by_host: { error: { message: 'Database error' } },
    });
    
    const supabase = createSupabaseClient<Database>(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: stub.fetch },
      }
    );
    
    const mockFetchBrand = async () => ({ name: 'Should not be called' });
    const resolution = await resolveBrand(supabase, 'error.example.com', null, branding, mockFetchBrand);
    const result = resolution.brand;
    
    check("Result identical to base on error", JSON.stringify(result) === JSON.stringify(branding));
    check("RPC was called", stub.calls.length > 0);
  }
  console.log();

  console.log("TEST: (e) Host normalisation resolves");
  {
    const gymId = '12345678-1234-1234-1234-123456789abc';
    
    // Test uppercase
    {
      const stub = createStubFetch({
        resolve_gym_by_host: [
          {
            gym_id: gymId,
            gym_slug: 'test',
            gym_name: 'Test Gym',
          verified: true,
          },
        ],
      });
      
      const mockFetchBrand = async (): Promise<Partial<Brand>> => ({
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
      });
      
      const supabase = createSupabaseClient<Database>(
        'https://test.supabase.co',
        'test-anon-key',
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { fetch: stub.fetch },
        }
      );
      
      const resolution = await resolveBrand(supabase, 'GYM.EXAMPLE.COM', null, branding, mockFetchBrand);
    const result = resolution.brand;
      check("Uppercase host resolves", resolution.gymId === gymId);
      check("Tier is 'host'", resolution.tier === "host");
      
      // Assert p_host received is lowercase
      const resolveCall = stub.calls.find(c => c.url.includes('/rpc/resolve_gym_by_host'));
      if (resolveCall?.body) {
        const bodyMatch = resolveCall.body.match(/"p_host"\s*:\s*"([^"]+)"/);
        if (bodyMatch) {
          check("p_host normalized to lowercase", bodyMatch[1] === 'gym.example.com');
        }
      }
    }
    
    // Test port
    {
      const stub = createStubFetch({
        resolve_gym_by_host: [
          {
            gym_id: gymId,
            gym_slug: 'test',
            gym_name: 'Test Gym Port',
          },
        ],
      });
      
      const mockFetchBrand = async (): Promise<Partial<Brand>> => ({
        name: 'Test Gym Port',
        colors: {
          accent: '#00ff00',
          accentHover: '#00cc00',
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
      });
      
      const supabase = createSupabaseClient<Database>(
        'https://test.supabase.co',
        'test-anon-key',
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { fetch: stub.fetch },
        }
      );
      
      const resolution = await resolveBrand(supabase, 'gym.example.com:443', null, branding, mockFetchBrand);
    const result = resolution.brand;
      check("Host with port resolves", resolution.gymId === gymId);
      check("Tier is 'host'", resolution.tier === "host");
      
      // Assert p_host received has port stripped
      const resolveCall = stub.calls.find(c => c.url.includes('/rpc/resolve_gym_by_host'));
      if (resolveCall?.body) {
        const bodyMatch = resolveCall.body.match(/"p_host"\s*:\s*"([^"]+)"/);
        if (bodyMatch) {
          check("p_host has port stripped", bodyMatch[1] === 'gym.example.com');
          check("p_host has no colon", !bodyMatch[1].includes(':'));
        }
      }
    }
  }
  console.log();

  console.log("TEST: Null host returns base");
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
    
    const mockFetchBrand = async () => ({ name: 'Should not be called' });
    const resolution = await resolveBrand(supabase, null, null, branding, mockFetchBrand);
    const result = resolution.brand;
    
    check("Null host returns base", JSON.stringify(result) === JSON.stringify(branding));
    check("No RPC called for null host", stub.calls.length === 0);
  }
  console.log();

  console.log("TEST: accent_color maps to accentHover (per gym-brand.ts)");
  {
    const gymId = '12345678-1234-1234-1234-123456789abc';
    
    const stub = createStubFetch({
      resolve_gym_by_host: [
        {
          gym_id: gymId,
          gym_slug: 'test',
          gym_name: 'Test Gym',
          verified: true,
        },
      ],
    });
    
    const mockFetchBrand = async (): Promise<Partial<Brand>> => ({
      name: 'Test Gym',
      colors: {
        accent: '#ff0000',        // primary_color
        accentHover: '#cc0000',   // accent_color
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
    });
    
    const supabase = createSupabaseClient<Database>(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: stub.fetch },
      }
    );
    
    const resolution = await resolveBrand(supabase, 'test.example.com', null, branding, mockFetchBrand);
    const result = resolution.brand;
    check("primary_color becomes accent", result.colors.accent === '#ff0000');
    check("accent_color becomes accentHover", result.colors.accentHover === '#cc0000');
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
