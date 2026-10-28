#!/usr/bin/env tsx

/**
 * Test: Runtime gym branding - Real resolver tests with stubFetch
 *
 * Tests resolveBrand with real Supabase client and recording stubFetch:
 * (a) Unmapped host produces base brand (byte-identical CSS and metadata)
 * (b) Verified mapped host returns gym's colors, name, logo
 * (c) Unverified host returns base (verify RPCs called)
 * (d) RPC error returns base
 * (e) Host normalisation (uppercase, port) resolves correctly
 * (f) Migration 037 exact shape validation
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { branding, type Brand } from "../src/lib/branding";
import { resolveBrand } from "../src/lib/runtime-brand";
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
    const response = responses[rpcName];
    
    if (!response) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    if (typeof response === 'object' && 'error' in response) {
      return new Response(JSON.stringify(response.error), {
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
  console.log("TEST: Migration 037 exact shape validation");
  {
    const gymId = '12345678-1234-1234-1234-123456789abc';
    
    // Test 1: Exact migration 037 shape (PostgREST returns array)
    console.log("  (1) Exact shape [{ gym_id, gym_slug, gym_name }] → tier host");
    {
      const stub = createStubFetch({
        resolve_gym_by_host: [
          {
            gym_id: gymId,
            gym_slug: 'iron-temple',
            gym_name: 'Iron Temple',
          },
        ],
      });
      
      const mockFetchBrand = async (): Promise<Partial<Brand>> => ({
        name: 'Iron Temple',
        colors: {
          ...branding.colors,
          accent: '#1E40AF',
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
      
      const resolution = await resolveBrand(supabase, 'iron.example.com', null, branding, mockFetchBrand, false);
      
      check("037 exact shape: tier is host", resolution.tier === "host");
      check("037 exact shape: resolved gym ID", resolution.gymId === gymId);
      check("037 exact shape: brand from gym", resolution.brand.colors.accent === '#1E40AF');
    }
    
    // Test 2: Empty array gives next tier
    console.log("  (2) Empty array [] → falls through to next tier");
    {
      const stub = createStubFetch({
        resolve_gym_by_host: [],
      });
      
      const mockFetchBrand = async () => ({ name: 'Should not be called' });
      const memberGym = { gymId: 'member-gym-id', gymName: 'Member Gym' };
      
      const supabase = createSupabaseClient<Database>(
        'https://test.supabase.co',
        'test-anon-key',
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { fetch: stub.fetch },
        }
      );
      
      const resolution = await resolveBrand(supabase, 'empty.example.com', memberGym, branding, mockFetchBrand, false);
      
      check("Empty array: tier is member (not host)", resolution.tier === "member");
      check("Empty array: gym ID from member", resolution.gymId === 'member-gym-id');
    }
    
    // Test 3: gym_id: null gives next tier
    console.log("  (3) gym_id: null → falls through to next tier");
    {
      const stub = createStubFetch({
        resolve_gym_by_host: [
          {
            gym_id: null,
            gym_slug: 'null-id',
            gym_name: 'Null ID Gym',
          },
        ],
      });
      
      const mockFetchBrand = async () => ({ name: 'Should not be called' });
      const memberGym = { gymId: 'member-gym-id', gymName: 'Member Gym' };
      
      const supabase = createSupabaseClient<Database>(
        'https://test.supabase.co',
        'test-anon-key',
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { fetch: stub.fetch },
        }
      );
      
      const resolution = await resolveBrand(supabase, 'nullid.example.com', memberGym, branding, mockFetchBrand, false);
      
      check("Null gym_id: tier is member (not host)", resolution.tier === "member");
      check("Null gym_id: gym ID from member", resolution.gymId === 'member-gym-id');
    }
    
    // Test 4: Extra unknown field is still accepted
    console.log("  (4) Extra unknown field → accepted (forward-compatible)");
    {
      const stub = createStubFetch({
        resolve_gym_by_host: [
          {
            gym_id: gymId,
            gym_slug: 'iron-temple',
            gym_name: 'Iron Temple',
            extra_field: 'should be ignored',
            future_column: 42,
          },
        ],
      });
      
      const mockFetchBrand = async (): Promise<Partial<Brand>> => ({
        name: 'Iron Temple',
        colors: {
          ...branding.colors,
          accent: '#1E40AF',
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
      
      const resolution = await resolveBrand(supabase, 'extra.example.com', null, branding, mockFetchBrand, false);
      
      check("Extra fields: tier is host", resolution.tier === "host");
      check("Extra fields: resolved gym ID", resolution.gymId === gymId);
      check("Extra fields: brand from gym", resolution.brand.colors.accent === '#1E40AF');
    }
    
    // Test 5: Missing gym_slug falls through to next tier
    console.log("  (5) Missing gym_slug → falls through to next tier");
    {
      const stub = createStubFetch({
        resolve_gym_by_host: [
          {
            gym_id: gymId,
            gym_name: 'Missing Slug Gym',
          },
        ],
      });
      
      const mockFetchBrand = async () => ({ name: 'Should not be called' });
      const memberGym = { gymId: 'member-gym-id', gymName: 'Member Gym' };
      
      const supabase = createSupabaseClient<Database>(
        'https://test.supabase.co',
        'test-anon-key',
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { fetch: stub.fetch },
        }
      );
      
      const resolution = await resolveBrand(supabase, 'no-slug.example.com', memberGym, branding, mockFetchBrand, false);
      
      check("Missing gym_slug: tier is member (not host)", resolution.tier === "member");
      check("Missing gym_slug: gym ID from member", resolution.gymId === 'member-gym-id');
    }
    
    // Test 6: Missing gym_name falls through to next tier
    console.log("  (6) Missing gym_name → falls through to next tier");
    {
      const stub = createStubFetch({
        resolve_gym_by_host: [
          {
            gym_id: gymId,
            gym_slug: 'missing-name',
          },
        ],
      });
      
      const mockFetchBrand = async () => ({ name: 'Should not be called' });
      const memberGym = { gymId: 'member-gym-id', gymName: 'Member Gym' };
      
      const supabase = createSupabaseClient<Database>(
        'https://test.supabase.co',
        'test-anon-key',
        {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { fetch: stub.fetch },
        }
      );
      
      const resolution = await resolveBrand(supabase, 'no-name.example.com', memberGym, branding, mockFetchBrand, false);
      
      check("Missing gym_name: tier is member (not host)", resolution.tier === "member");
      check("Missing gym_name: gym ID from member", resolution.gymId === 'member-gym-id');
    }
  }
  console.log();

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
    
    let brandFetchCalled = false;
    const mockFetchBrand = async () => {
      brandFetchCalled = true;
      return {};
    };
    
    const resolution = await resolveBrand(supabase, 'unmapped.example.com', null, branding, mockFetchBrand, false);
    const result = resolution.brand;
    
    check("Tier is 'base'", resolution.tier === "base");
    check("Name unchanged", result.name === branding.name);
    check("Colors unchanged", JSON.stringify(result.colors) === JSON.stringify(branding.colors));
    check("Result byte-identical to base", JSON.stringify(result) === JSON.stringify(branding));
    
    const baseCss = getBrandCssVariables(branding);
    const resultCss = getBrandCssVariables(result);
    check("CSS byte-identical", baseCss === resultCss);
    
    check("resolve_gym_by_host called", stub.calls.some(c => c.url.includes('/rpc/resolve_gym_by_host')));
    check("Brand fetcher NOT called", !brandFetchCalled);
  }
  console.log();

  console.log("TEST: (b) Verified mapped host returns gym's colors, name, logo");
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
    
    const mockFetchBrand = async (id: string): Promise<Partial<Brand>> => {
      check("Correct gym ID passed", id === gymId);
      return {
        name: 'Test Gym',
        logo: 'https://example.com/logo.png',
        colors: {
          ...branding.colors,
          accent: '#ff0000',
          accentHover: '#cc0000',
          accentFg: '#000000',
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
    
    const resolution = await resolveBrand(supabase, 'test.example.com', null, branding, mockFetchBrand, false);
    const result = resolution.brand;
    
    check("Tier is 'host'", resolution.tier === "host");
    check("Name merged", result.name === 'Test Gym');
    check("Logo merged", result.logo === 'https://example.com/logo.png');
    check("Primary color merged", result.colors.accent === '#ff0000');
    check("Accent color merged", result.colors.accentHover === '#cc0000');
    check("accentFg merged", result.colors.accentFg === '#000000');
    
    check("resolve_gym_by_host called", stub.calls.some(c => c.url.includes('/rpc/resolve_gym_by_host')));
    
    const resolveCall = stub.calls.find(c => c.url.includes('/rpc/resolve_gym_by_host'));
    if (resolveCall?.body) {
      const bodyMatch = resolveCall.body.match(/"p_host"\s*:\s*"([^"]+)"/);
      if (bodyMatch) {
        check("p_host is lowercase", bodyMatch[1] === 'test.example.com');
        check("p_host has no port", !bodyMatch[1].includes(':'));
      }
    }
  }
  console.log();

  console.log("TEST: (c) Unverified host returns base");
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
    
    let brandFetchCalled = false;
    const mockFetchBrand = async () => {
      brandFetchCalled = true;
      return {};
    };
    
    const resolution = await resolveBrand(supabase, 'unverified.example.com', null, branding, mockFetchBrand, false);
    const result = resolution.brand;
    
    check("Result identical to base", JSON.stringify(result) === JSON.stringify(branding));
    check("resolve_gym_by_host called", stub.calls.length > 0);
    check("Brand fetcher NOT called", !brandFetchCalled);
  }
  console.log();

  console.log("TEST: (d) PostgREST error (HTTP 500) returns neutralBrand");
  {
    // Stub that returns PostgREST error (500 + error body)
    const calls: FetchCall[] = [];
    
    const stub = {
      calls,
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = init?.method || 'GET';
        const body = init?.body ? init.body.toString() : undefined;
        
        stub.calls.push({ url, method, body });
        
        // Return PostgREST error (status 500)
        return new Response(
          JSON.stringify({ 
            message: "Database connection error",
            code: "PGRST000",
            details: "Connection refused",
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      },
    };
    
    const supabase = createSupabaseClient<Database>(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: stub.fetch },
      }
    );
    
    const mockFetchBrand = async () => ({ name: 'Should not be called' });
    const resolution = await resolveBrand(supabase, 'error.example.com', null, branding, mockFetchBrand, false);
    
    check("PostgREST 500 error returns neutralBrand", resolution.tier === "neutral");
    check("PostgREST 500 error: gymId is null", resolution.gymId === null);
    check("PostgREST 500 error: gymName is null", resolution.gymName === null);
    // neutralBrand is merged with base, so check tier is sufficient
    
    // Verify p_host was sent
    const resolveCall = stub.calls.find(c => c.url.includes('/rpc/resolve_gym_by_host'));
    check("RPC was called", resolveCall !== undefined);
    
    const bodyMatch = resolveCall?.body?.match(/"p_host"\s*:\s*"([^"]+)"/);
    check("p_host present in body", bodyMatch !== null);
    if (bodyMatch) {
      check("p_host is error.example.com", bodyMatch[1] === "error.example.com");
    }
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
          ...branding.colors,
          accent: '#ff0000',
          accentHover: '#cc0000',
          accentFg: '#000000',
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
      
      const resolution = await resolveBrand(supabase, 'GYM.EXAMPLE.COM', null, branding, mockFetchBrand, false);
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
          ...branding.colors,
          accent: '#00ff00',
          accentHover: '#00cc00',
          accentFg: '#000000',
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
      
      const resolution = await resolveBrand(supabase, 'gym.example.com:443', null, branding, mockFetchBrand, false);
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
    const resolution = await resolveBrand(supabase, null, null, branding, mockFetchBrand, false);
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
        },
      ],
    });
    
    const mockFetchBrand = async (): Promise<Partial<Brand>> => ({
      name: 'Test Gym',
      colors: {
        ...branding.colors,
        accent: '#ff0000',        // primary_color
        accentHover: '#cc0000',   // accent_color
        accentFg: '#000000',
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
    
    const resolution = await resolveBrand(supabase, 'test.example.com', null, branding, mockFetchBrand, false);
    const result = resolution.brand;
    
    check("primary_color becomes accent", result.colors.accent === '#ff0000');
    check("accent_color becomes accentHover", result.colors.accentHover === '#cc0000');
  }
  console.log();

  console.log("TEST: MUTANT M1 - RPC shape check catches missing fields");
  {
    const stub = createStubFetch({
      resolve_gym_by_host: [
        {
          gym_id: 'gym-1',
          // MISSING gym_slug - should fail shape check
          gym_name: 'Test Gym',
        }
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
    
    const mockFetchBrand = async (): Promise<Partial<Brand>> => ({ name: 'Test Gym', colors: { ...branding.colors, accent: '#10B981' } });
    
    const resolution = await resolveBrand(supabase, 'malformed.example.com', null, branding, mockFetchBrand, false);
    
    check("M1: Shape check catches malformed row", resolution.tier === "base");
    check("M1: Falls through on bad data", resolution.gymId === null);
  }
  console.log();

  console.log("TEST: MUTANT M3 - Port normalization (assert RPC param strips port)");
  {
    const gymId = 'gym-m3-id';
    const stub = createStubFetch({
      resolve_gym_by_host: [{ gym_id: gymId, gym_slug: 'port-gym', gym_name: 'Port Gym' }],
    });
    
    const supabase = createSupabaseClient<Database>(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: stub.fetch },
      }
    );
    
    const mockFetchBrand = async (): Promise<Partial<Brand>> => ({ name: 'Port Gym', colors: { ...branding.colors, accent: '#3B82F6' } });
    
    const resolution = await resolveBrand(supabase, 'gym.example.com:3000', null, branding, mockFetchBrand, false);
    
    check("M3: Resolution succeeds", resolution.gymId === gymId);
    
    const resolveCall = stub.calls.find(c => c.url.includes('/rpc/resolve_gym_by_host'));
    const pHost = resolveCall?.body ? JSON.parse(resolveCall.body).p_host : null;
    check("M3: p_host has port :3000 stripped", pHost === 'gym.example.com');
  }
  console.log();

  console.log("TEST: MUTANT M12 - Host RPC error returns neutralBrand (not member/base)");
  {
    const stub = createStubFetch({
      resolve_gym_by_host: { error: 'Database error' },
    });
    
    const supabase = createSupabaseClient<Database>(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: stub.fetch },
      }
    );
    
    const mockFetchBrand = async (): Promise<Partial<Brand>> => ({ name: 'Member Gym', colors: { ...branding.colors, accent: '#EF4444' } });
    const memberGym = { gymId: 'member-gym-id', gymName: 'Member Gym' };
    
    const resolution = await resolveBrand(supabase, 'error.example.com', memberGym, branding, mockFetchBrand, false);
    
    check("M12: Tier is neutral on host RPC error", resolution.tier === "neutral");
    check("M12: Uses neutralBrand", resolution.gymId === null);
    check("M12: Not showing member gym", resolution.gymName === null);
  }
  console.log();

  console.log("TEST: Skip tier 1 - Host present wins over member");
  {
    const hostGymId = 'host-gym-id';
    const memberGymId = 'member-gym-id';
    
    const stub = createStubFetch({
      resolve_gym_by_host: [{ gym_id: hostGymId, gym_slug: 'host-gym', gym_name: 'Host Gym' }],
    });
    
    const supabase = createSupabaseClient<Database>(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: stub.fetch },
      }
    );
    
    const mockFetchBrand = async (gymId: string): Promise<Partial<Brand>> => {
      if (gymId === hostGymId) {
        return { name: 'Host Gym', colors: { ...branding.colors, accent: '#F59E0B' } };
      }
      return { name: 'Member Gym', colors: { ...branding.colors, accent: '#EF4444' } };
    };
    
    const memberGym = { gymId: memberGymId, gymName: 'Member Gym' };
    const resolution = await resolveBrand(supabase, 'host.example.com', memberGym, branding, mockFetchBrand, false);
    
    check("Skip-tier-1: Tier is host (not member)", resolution.tier === "host");
    check("Skip-tier-1: Gym ID is host gym", resolution.gymId === hostGymId);
    check("Skip-tier-1: Brand from host (not member)", resolution.brand.colors.accent === '#F59E0B');
  }
  console.log();

  console.log("TEST: Member-over-host ordering - Member tier tried before base");
  {
    const memberGymId = 'member-gym-id';
    
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
    
    const mockFetchBrand = async (gymId: string): Promise<Partial<Brand>> => {
      if (gymId === memberGymId) {
        return { name: 'Member Gym', colors: { ...branding.colors, accent: '#10B981' } };
      }
      return {};
    };
    
    const memberGym = { gymId: memberGymId, gymName: 'Member Gym' };
    const resolution = await resolveBrand(supabase, 'unmapped.example.com', memberGym, branding, mockFetchBrand, false);
    
    check("Member-over-host: Tier is member (not base)", resolution.tier === "member");
    check("Member-over-host: Gym ID from membership", resolution.gymId === memberGymId);
    check("Member-over-host: Brand from member gym", resolution.brand.colors.accent === '#10B981');
  }
  console.log();

  console.log("TEST: Drop guard - Malformed RPC row falls through to next tier");
  {
    const memberGymId = 'member-gym-id';
    
    const stub = createStubFetch({
      resolve_gym_by_host: [
        {
          // Malformed: missing gym_slug
          gym_id: 'malformed-id',
          gym_name: 'Malformed Gym',
        }
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
    
    const mockFetchBrand = async (gymId: string): Promise<Partial<Brand>> => {
      if (gymId === memberGymId) {
        return { name: 'Member Gym', colors: { ...branding.colors, accent: '#8B5CF6' } };
      }
      return {};
    };
    
    const memberGym = { gymId: memberGymId, gymName: 'Member Gym' };
    const resolution = await resolveBrand(supabase, 'malformed.example.com', memberGym, branding, mockFetchBrand, false);
    
    check("Drop-guard: Falls through to member tier", resolution.tier === "member");
    check("Drop-guard: Uses member gym (not malformed)", resolution.gymId === memberGymId);
  }
  console.log();

  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed`);
    process.exit(1);
  }

  console.log("\n✅ All tests passed");
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
