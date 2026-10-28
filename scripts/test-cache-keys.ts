#!/usr/bin/env tsx

/**
 * Test: Cache key construction includes normalized host and gym ID
 * 
 * Verifies that unstable_cache is called with keys containing:
 * - Normalized host for host resolution
 * - Gym ID for brand fetching
 */

import { strict as assert } from "assert";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type CacheCall = {
  keyParts: string[];
  tags?: { tags?: string[] };
};

async function testCacheKeyInclusion() {
  console.log("Test: Cache key construction");
  
  const recordedCacheCalls: CacheCall[] = [];
  
  // Type-safe unstable_cache stub
  const unstableCacheStub = <T extends (...args: never[]) => Promise<unknown>>(
    fn: T,
    keyParts?: string[],
    tags?: { tags?: string[] }
  ): T => {
    if (keyParts) {
      recordedCacheCalls.push({ keyParts, tags });
    }
    // Return the function unwrapped (execute immediately, no actual caching)
    return fn;
  };
  
  // Inject stub before importing modules
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Module = require("module");
  const originalRequire = Module.prototype.require;
  // eslint-disable-next-line prefer-rest-params
  Module.prototype.require = function (id: string) {
    if (id === "next/cache") {
      return {
        ...originalRequire.apply(this, [id]),
        unstable_cache: unstableCacheStub,
      };
    }
    // eslint-disable-next-line prefer-rest-params
    return originalRequire.apply(this, arguments);
  };
  
  try {
    // Clear module cache to pick up stubbed unstable_cache
    Object.keys(require.cache).forEach((key) => {
      if (key.includes("runtime-brand") || key.includes("gym-brand")) {
        delete require.cache[key];
      }
    });
    
    const { resolveBrand } = await import("@/lib/runtime-brand");
    const { branding } = await import("@/lib/branding");
    
    // Create a real stub fetch
    type FetchCall = {
      url: string;
      method: string;
      body?: string;
    };
    
    const calls: FetchCall[] = [];
    
    const stubFetch: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method || 'GET';
      const body = init?.body ? init.body.toString() : undefined;
      
      calls.push({ url, method, body });
      
      // Return host resolution result
      if (url.includes('/rpc/resolve_gym_by_host')) {
        return new Response(
          JSON.stringify([
            {
              gym_id: "test-gym-123",
              gym_slug: "test-gym",
              gym_name: "Test Gym",
            },
          ]),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      
      // Return gym brand result
      if (url.includes('gyms') && url.includes('select')) {
        return new Response(
          JSON.stringify({
            name: "Test Gym",
            primary_color: "#FF0000",
            accent_color: "#00FF00",
            logo_url: "https://example.com/logo.png",
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      
      return new Response(JSON.stringify(null), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    
    // Create real Supabase client with stub fetch
    const supabase = createSupabaseClient<Database>(
      'https://test.supabase.co',
      'test-anon-key',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: stubFetch },
      }
    );
    
    // Clear recorded calls
    recordedCacheCalls.length = 0;
    
    // Trigger resolution with caching enabled (useCache=true)
    const resolution = await resolveBrand(
      supabase,
      "Custom.Example.COM:3000",  // Will be normalized to custom.example.com
      null,
      branding,
      undefined,
      true  // useCache=true
    );
    
    console.log("  Cache calls recorded:", recordedCacheCalls.length);
    
    // Verify host cache key
    const hostCacheCall = recordedCacheCalls.find((c) =>
      c.keyParts.some((k) => k.includes("gym-host-"))
    );
    assert.ok(hostCacheCall, "Host resolution should use unstable_cache");
    
    const hostKey = hostCacheCall.keyParts.find((k) => k.includes("gym-host-"));
    console.log("  Host cache key:", hostKey);
    assert.ok(
      hostKey && hostKey.includes("custom.example.com"),
      "Cache key must include normalized host (lowercase, no port)"
    );
    
    // Verify gym brand cache key
    const gymCacheCall = recordedCacheCalls.find((c) =>
      c.keyParts.some((k) => k.includes("gym-brand-"))
    );
    assert.ok(gymCacheCall, "Gym brand fetch should use unstable_cache");
    
    const gymKey = gymCacheCall.keyParts.find((k) => k.includes("gym-brand-"));
    console.log("  Gym cache key:", gymKey);
    assert.ok(
      gymKey && gymKey.includes("test-gym-123"),
      "Cache key must include gym ID"
    );
    
    console.log("  ✓ Cache keys include normalized host and gym ID");
  } finally {
    // Restore original require
    Module.prototype.require = originalRequire;
    
    // Clear module cache again
    Object.keys(require.cache).forEach((key) => {
      if (key.includes("runtime-brand") || key.includes("gym-brand")) {
        delete require.cache[key];
      }
    });
  }
}

async function main() {
  await testCacheKeyInclusion();
  console.log("\n✅ Cache key test passed");
}

main().catch((err) => {
  console.error("Test failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});
