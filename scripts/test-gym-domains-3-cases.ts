/**
 * Unit tests for gym resolution 3-case logic.
 * Tests the pure decision function that takes:
 * - normalized host
 * - isAppDomain flag
 * - lookup result
 * - lookup error flag
 * 
 * And returns:
 * - null (default brand) for app domains and unmapped hosts
 * - USE_NEUTRAL_BRAND (neutral brand) for RPC errors on custom domains
 * - GymResolution for mapped custom domains
 * 
 * Also tests wiring (W1-W6 mutants) by injecting mocks into resolveGymByHost:
 * - W1: RPC error -> USE_NEUTRAL_BRAND
 * - W2: Empty result -> null
 * - W3: localhost -> no RPC call
 * - W4: NEXT_PUBLIC_SITE_URL host -> null
 * - W5-W6: isAppDomain=true -> null (respects the check even with data)
 */

import { 
  decideGymResolution, 
  normalizeHost, 
  isAppOwnDomain, 
  getDefaultBrand, 
  getNeutralBrand,
  USE_NEUTRAL_BRAND,
  resolveGymByHost,
  type GymResolution,
  type ResolveGymByHostRpc
} from "../src/lib/gym-domains";
import { branding } from "../src/lib/branding";
import { neutralBrand } from "../src/lib/gym-brand";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

async function runTests() {
  console.log("TEST: Case 1 - App's own domain returns null (use default brand)");
  {
    // Test isAppOwnDomain helper
    check("localhost is app domain", isAppOwnDomain("localhost"));
    check("localhost:3000 is app domain", isAppOwnDomain("localhost:3000"));
    check("127.0.0.1 is app domain", isAppOwnDomain("127.0.0.1"));
    check("127.0.0.1:8080 is app domain", isAppOwnDomain("127.0.0.1:8080"));
    check("::1 is app domain", isAppOwnDomain("::1"));
    check("vercel.app is app domain", isAppOwnDomain("vercel.app"));
    check("my-app.vercel.app is app domain", isAppOwnDomain("my-app.vercel.app"));
    
    // Test decideGymResolution for app domains
    const result1 = decideGymResolution("localhost", true, null, false);
    check("localhost -> null", result1 === null);
    
    const result2 = decideGymResolution("vercel.app", true, [], false);
    check("vercel.app -> null", result2 === null);
    
    // When result is null, caller should use default brand
    const defaultBrand = getDefaultBrand();
    check("Default brand is branding constant", defaultBrand === branding);
    check("Default brand has name", Boolean(defaultBrand.name));
  }
  console.log();

  console.log("TEST: Case 2 - Unmapped host returns null (use default brand)");
  {
    // Custom domain, no error, but empty result
    const result1 = decideGymResolution("unmapped.example.com", false, [], false);
    check("Unmapped host with empty array -> null", result1 === null);
    
    const result2 = decideGymResolution("another-unmapped.com", false, null, false);
    check("Unmapped host with null data -> null", result2 === null);
    
    // Not an app domain
    check("unmapped.example.com is NOT app domain", !isAppOwnDomain("unmapped.example.com"));
  }
  console.log();

  console.log("TEST: Case 3 - RPC error on custom domain returns USE_NEUTRAL_BRAND");
  {
    // Custom domain, RPC error (lookupError = true)
    const result1 = decideGymResolution("custom.example.com", false, null, true);
    check("Custom domain with RPC error -> USE_NEUTRAL_BRAND", result1 === USE_NEUTRAL_BRAND);
    
    // Even if we somehow have data but also an error, error takes precedence
    const mockData: GymResolution[] = [{
      gymId: "test-id",
      gymSlug: "test-slug",
      gymName: "Test Gym"
    }];
    const result2 = decideGymResolution("error.example.com", false, mockData, true);
    check("Error flag takes precedence over data", result2 === USE_NEUTRAL_BRAND);
    
    // When USE_NEUTRAL_BRAND is returned, caller should use neutral brand
    const neutral = getNeutralBrand();
    check("Neutral brand is neutralBrand constant", neutral === neutralBrand);
    check("Neutral brand has 'neutral' id", neutral.id === "neutral");
    check("Neutral brand has 'Fitness' name", neutral.name === "Fitness");
    check("Neutral brand is not Abhyas", neutral.name !== "Abhyas");
  }
  console.log();

  console.log("TEST: Case 4 - Mapped custom domain returns GymResolution");
  {
    const mockData: GymResolution[] = [{
      gymId: "gym-123",
      gymSlug: "my-gym",
      gymName: "My Fitness Gym"
    }];
    
    const result = decideGymResolution("custom.gym.com", false, mockData, false);
    check("Mapped custom domain returns GymResolution", result !== null && result !== USE_NEUTRAL_BRAND);
    
    if (result && result !== USE_NEUTRAL_BRAND) {
      check("GymResolution has gymId", result.gymId === "gym-123");
      check("GymResolution has gymSlug", result.gymSlug === "my-gym");
      check("GymResolution has gymName", result.gymName === "My Fitness Gym");
    }
  }
  console.log();

  console.log("TEST: normalizeHost edge cases");
  {
    check("Uppercase normalized", normalizeHost("EXAMPLE.COM") === "example.com");
    check("Port stripped", normalizeHost("example.com:3000") === "example.com");
    check("Trailing dot stripped", normalizeHost("example.com.") === "example.com");
    check("IPv6 brackets stripped", normalizeHost("[::1]:3000") === "::1");
    check("Empty returns empty", normalizeHost("") === "");
    check("Whitespace trimmed", normalizeHost("  example.com  ") === "example.com");
  }
  console.log();

  console.log("TEST: Symbol uniqueness");
  {
    check("USE_NEUTRAL_BRAND is defined", USE_NEUTRAL_BRAND !== undefined);
    check("USE_NEUTRAL_BRAND is a symbol", typeof USE_NEUTRAL_BRAND === "symbol");
    check("USE_NEUTRAL_BRAND !== null", USE_NEUTRAL_BRAND !== null);
    check("USE_NEUTRAL_BRAND !== undefined", USE_NEUTRAL_BRAND !== undefined);
  }
  console.log();

  console.log("TEST: Wiring W1 - RPC error returns USE_NEUTRAL_BRAND");
  {
    const mockRpcError: ResolveGymByHostRpc = async (_host: string) => {
      return { data: null, error: new Error("Database timeout") };
    };
    
    const result = await resolveGymByHost("custom.example.com", mockRpcError);
    check("RPC error on custom domain -> USE_NEUTRAL_BRAND", result === USE_NEUTRAL_BRAND);
  }
  console.log();

  console.log("TEST: Wiring W2 - Empty result returns null");
  {
    const mockRpcEmpty: ResolveGymByHostRpc = async (_host: string) => {
      return { data: [], error: null };
    };
    
    const result = await resolveGymByHost("unmapped.example.com", mockRpcEmpty);
    check("Empty RPC result -> null", result === null);
  }
  console.log();

  console.log("TEST: Wiring W3 - localhost skips RPC call");
  {
    let rpcCalled = false;
    const mockRpcNeverCalled: ResolveGymByHostRpc = async (_host: string) => {
      rpcCalled = true;
      return { data: null, error: null };
    };
    
    const result = await resolveGymByHost("localhost", mockRpcNeverCalled);
    check("localhost -> null", result === null);
    check("RPC was not called for localhost", !rpcCalled);
  }
  console.log();

  console.log("TEST: Wiring W4 - NEXT_PUBLIC_SITE_URL host returns null");
  {
    const oldSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://myapp.example.com";
    
    let rpcCalled = false;
    const mockRpcNeverCalled: ResolveGymByHostRpc = async (_host: string) => {
      rpcCalled = true;
      return { data: null, error: null };
    };
    
    const result = await resolveGymByHost("myapp.example.com", mockRpcNeverCalled);
    check("NEXT_PUBLIC_SITE_URL host -> null", result === null);
    check("RPC was not called for NEXT_PUBLIC_SITE_URL host", !rpcCalled);
    
    // Restore
    if (oldSiteUrl !== undefined) {
      process.env.NEXT_PUBLIC_SITE_URL = oldSiteUrl;
    } else {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    }
  }
  console.log();

  console.log("TEST: Wiring W5-W6 - isAppDomain=true respects check even with data");
  {
    // Even if RPC somehow returns data for an app domain, we should still return null
    const mockRpcWithData: ResolveGymByHostRpc = async (_host: string) => {
      return { 
        data: [{ gym_id: "fake-id", gym_slug: "fake", gym_name: "Fake" }], 
        error: null 
      };
    };
    
    const result1 = await resolveGymByHost("localhost", mockRpcWithData);
    check("localhost with data -> null (respects isAppDomain)", result1 === null);
    
    const result2 = await resolveGymByHost("vercel.app", mockRpcWithData);
    check("vercel.app with data -> null (respects isAppDomain)", result2 === null);
  }
  console.log();

  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed\n`);
    process.exit(1);
  }

  console.log("\n✅ All tests passed\n");
  process.exit(0);
}

runTests();
