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
 */

import { 
  decideGymResolution, 
  normalizeHost, 
  isAppOwnDomain, 
  getDefaultBrand, 
  getNeutralBrand,
  USE_NEUTRAL_BRAND,
  type GymResolution 
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

function runTests() {
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

  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed\n`);
    process.exit(1);
  }

  console.log("\n✅ All tests passed\n");
  process.exit(0);
}

runTests();
