/**
 * Unit tests for resolveGymByHost 3-case logic.
 * Tests the real code paths for:
 * - Case 1: App's own domain (localhost, *.vercel.app, NEXT_PUBLIC_SITE_URL) -> null (default brand)
 * - Case 2: Unmapped host (no verified row) -> null (default brand)
 * - Case 3: RPC error on custom domain -> USE_NEUTRAL_BRAND symbol (neutral brand)
 */

import { resolveGymByHost, USE_NEUTRAL_BRAND, normalizeHost, getDefaultBrand, getNeutralBrand } from "../src/lib/gym-domains";
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
    // localhost
    const result1 = await resolveGymByHost("localhost");
    check("localhost returns null", result1 === null);
    
    const result2 = await resolveGymByHost("localhost:3000");
    check("localhost:3000 returns null", result2 === null);
    
    // 127.0.0.1
    const result3 = await resolveGymByHost("127.0.0.1");
    check("127.0.0.1 returns null", result3 === null);
    
    const result4 = await resolveGymByHost("127.0.0.1:8080");
    check("127.0.0.1:8080 returns null", result4 === null);
    
    // IPv6 localhost
    const result5 = await resolveGymByHost("::1");
    check("::1 returns null", result5 === null);
    
    const result6 = await resolveGymByHost("[::1]:3000");
    check("[::1]:3000 returns null", result6 === null);
    
    // *.vercel.app
    const result7 = await resolveGymByHost("my-app.vercel.app");
    check("my-app.vercel.app returns null", result7 === null);
    
    const result8 = await resolveGymByHost("vercel.app");
    check("vercel.app returns null", result8 === null);
    
    // When result is null, caller should use default brand
    const defaultBrand = getDefaultBrand();
    check("Default brand is branding constant", defaultBrand === branding);
    check("Default brand has Abhyas name", defaultBrand.name.includes("Abhyas") || defaultBrand.id === "default");
  }
  console.log();

  console.log("TEST: Case 2 - Unmapped host returns null (use default brand)");
  {
    // A host that isn't in the database (genuinely unmapped)
    // This should succeed (no RPC error) but return no rows
    const result = await resolveGymByHost("unmapped-host-xyz123.example.com");
    check("Unmapped host returns null", result === null);
    
    // Another unmapped host
    const result2 = await resolveGymByHost("definitely-not-mapped.test");
    check("Another unmapped host returns null", result2 === null);
  }
  console.log();

  console.log("TEST: Case 3 markers - USE_NEUTRAL_BRAND and neutral brand");
  {
    // We can't easily simulate an RPC error in unit tests without mocking,
    // but we can verify the USE_NEUTRAL_BRAND symbol and neutral brand exist
    check("USE_NEUTRAL_BRAND symbol is defined", USE_NEUTRAL_BRAND !== undefined);
    check("USE_NEUTRAL_BRAND is a symbol", typeof USE_NEUTRAL_BRAND === "symbol");
    
    // When USE_NEUTRAL_BRAND is returned, caller should use neutral brand
    const neutral = getNeutralBrand();
    check("Neutral brand is neutralBrand constant", neutral === neutralBrand);
    check("Neutral brand has 'neutral' id", neutral.id === "neutral");
    check("Neutral brand has 'Fitness' name", neutral.name === "Fitness");
    check("Neutral brand is not Abhyas", neutral.name !== "Abhyas");
    check("Neutral brand has neutral colors", neutral.primaryColor === "#6b7280");
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

  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed\n`);
    process.exit(1);
  }

  console.log("\n✅ All tests passed\n");
  process.exit(0);
}

runTests();
