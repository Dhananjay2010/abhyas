/**
 * Test: Runtime gym branding - Real resolver tests with stubFetch
 *
 * Tests resolveBrandForHost with real Supabase client and recording stubFetch:
 * (a) Unmapped host produces base brand (byte-identical CSS and metadata)
 * (b) Verified mapped host returns gym's colors, name, logo
 * (c) Unverified host returns base (verify RPCs called)
 * (d) RPC error returns base
 * (e) Host normalisation (uppercase, port) resolves correctly
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { branding, type Brand } from "../src/lib/branding";
import { resolveBrandForHost, getBrandCssVariablesForBrand } from "../src/lib/runtime-brand";
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
  
  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
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
    },
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
        global: { fetch: stub.fetch as typeof fetch },
      }
    );
    
    const mockFetchBrand = async () => ({ name: 'Should not be called' });
    const result = await resolveBrandForHost(supabase, 'unmapped.example.com', branding, mockFetchBrand);
    
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
        global: { fetch: stub.fetch as typeof fetch },
      }
    );
    
    const result = await resolveBrandForHost(supabase, 'fitcore.example.com', branding, mockFetchBrand);
    
    check("Name merged", result.name === 'FitCore Gym');
    check("Logo merged", result.logo === 'https://example.com/logo.png');
    check("Timezone merged", result.timezone === 'America/New_York');
    check("Primary color merged", result.colors.accent === '#3b82f6');
    check("Accent color merged", result.colors.accentHover === '#2563eb');
    check("accentFg derived", result.colors.accentFg === '#000000');
    
    // Verify resolve_gym_by_host was called
    const resolveCall = stub.calls.find(c => c.url.includes('/rpc/resolve_gym_by_host'));
    check("resolve_gym_by_host called", resolveCall !== undefined);
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
        global: { fetch: stub.fetch as typeof fetch },
      }
    );
    
    let brandFetchCalled = false;
    const mockFetchBrand = async () => {
      brandFetchCalled = true;
      return {};
    };
    
    const result = await resolveBrandForHost(supabase, 'unverified.example.com', branding, mockFetchBrand);
    
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
        global: { fetch: stub.fetch as typeof fetch },
      }
    );
    
    const mockFetchBrand = async () => ({ name: 'Should not be called' });
    const result = await resolveBrandForHost(supabase, 'error.example.com', branding, mockFetchBrand);
    
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
          global: { fetch: stub.fetch as typeof fetch },
        }
      );
      
      const result = await resolveBrandForHost(supabase, 'GYM.EXAMPLE.COM', branding, mockFetchBrand);
      check("Uppercase host resolves", result.name === 'Test Gym');
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
          global: { fetch: stub.fetch as typeof fetch },
        }
      );
      
      const result = await resolveBrandForHost(supabase, 'gym.example.com:443', branding, mockFetchBrand);
      check("Host with port resolves", result.name === 'Test Gym Port');
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
        global: { fetch: stub.fetch as typeof fetch },
      }
    );
    
    const mockFetchBrand = async () => ({ name: 'Should not be called' });
    const result = await resolveBrandForHost(supabase, null, branding, mockFetchBrand);
    
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
        global: { fetch: stub.fetch as typeof fetch },
      }
    );
    
    const result = await resolveBrandForHost(supabase, 'test.example.com', branding, mockFetchBrand);
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
