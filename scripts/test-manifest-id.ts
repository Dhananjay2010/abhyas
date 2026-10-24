/**
 * Test: Manifest ID stability for existing PWA installs
 *
 * Verifies:
 * - Default brand (abhyas) uses "/" as manifest id (stable for existing installs)
 * - Other brands use brand-scoped id "/?brand={id}"
 */

import manifest from "../src/app/manifest";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testManifestId() {
  console.log("\n▶ Testing manifest id...");

  const currentBrand = process.env.NEXT_PUBLIC_BRAND || "default";
  const m = manifest();

  console.log(`  Current brand: ${currentBrand}`);
  console.log(`  Manifest id: ${m.id}`);

  if (currentBrand === "default") {
    assert(
      m.id === "/",
      `Default brand manifest id must be "/" for PWA install stability (got: ${m.id})`
    );
    console.log("  ✓ Default brand uses stable '/' id");
  } else {
    const expected = `/?brand=${currentBrand}`;
    assert(
      m.id === expected,
      `Brand "${currentBrand}" manifest id must be "/?brand=${currentBrand}" (got: ${m.id})`
    );
    console.log(`  ✓ Brand "${currentBrand}" uses brand-scoped id`);
  }

  // Verify other manifest basics
  assert(Boolean(m.name && m.name.length > 0), "Manifest must have a name");
  assert(Boolean(m.short_name && m.short_name.length > 0), "Manifest must have a short_name");
  assert(m.start_url === "/", "Manifest start_url must be '/'");
  assert(m.scope === "/", "Manifest scope must be '/'");

  console.log("  ✓ Manifest structure valid");
}

function main() {
  console.log("Testing manifest id configuration...");

  try {
    testManifestId();
    console.log("\n✅ All manifest id tests passed!\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Manifest id tests failed:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
