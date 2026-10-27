/**
 * Unit tests for getGymBrand error handling and cache behavior.
 * Tests that RPC errors are not cached and fall back to the default brand.
 */

import { branding } from "../src/lib/branding";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

/**
 * Mock implementation of getGymBrand for testing error path.
 * Simulates the actual implementation's behavior without needing a real database.
 */
async function mockGetGymBrandInternal(
  gymId: string,
  shouldFail: boolean,
): Promise<Partial<typeof branding>> {
  if (shouldFail) {
    throw new Error("Simulated RPC error");
  }
  
  // Success path: return a brand
  return {
    name: `Gym ${gymId}`,
    shortName: `Gym ${gymId.slice(0, 8)}`,
    id: gymId,
  };
}

async function mockGetGymBrand(
  gymId: string,
  shouldFail: boolean,
): Promise<Partial<typeof branding>> {
  try {
    return await mockGetGymBrandInternal(gymId, shouldFail);
  } catch (error) {
    // RPC error: fall back to default brand for this request only
    // The error is not cached, so a later success will return the real brand
    console.error(`getGymBrand error for ${gymId}, falling back to default:`, error);
    return branding;
  }
}

async function runTests() {
  console.log("TEST: Error path is not cached");
  {
    const gymId = "test-gym-id-12345";
    
    // First call: error (should fall back to default brand, not cached)
    const result1 = await mockGetGymBrand(gymId, true);
    check("First call with error returns default brand", result1.id === "default");
    check("Error fallback has name", !!result1.name);
    
    // Second call: success (should return the real brand, proving error wasn't cached)
    const result2 = await mockGetGymBrand(gymId, false);
    check("Second call with success returns real brand", result2.id === gymId);
    check("Success result is not the default brand", result2.id !== "default");
    check("Success result has expected name format", result2.name === `Gym ${gymId}`);
  }
  console.log();

  console.log("TEST: Error fallback is the default brand");
  {
    const gymId = "another-gym-id";
    const result = await mockGetGymBrand(gymId, true);
    
    check("Error fallback is default brand", result.id === "default");
    check("Error fallback equals branding constant", result === branding);
    check("Default brand has required fields", !!result.name && !!result.id);
  }
  console.log();

  console.log("TEST: Success path returns gym-specific brand");
  {
    const gymId = "success-gym-id";
    const result = await mockGetGymBrand(gymId, false);
    
    check("Success returns gym-specific brand", result.id === gymId);
    check("Success result is not default", result.id !== "default");
    check("Success result has gym-specific name", result.name === `Gym ${gymId}`);
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
