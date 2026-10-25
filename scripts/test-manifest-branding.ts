/**
 * Test: Web app manifest derives all values from branding config.
 *
 * Ensures the manifest never hard-codes colors, names, or icon paths,
 * so white-label deployments work correctly.
 */

import manifest from "../src/app/manifest";
import { branding, getAllBrands } from "../src/lib/branding";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

console.log("Testing Manifest Branding Integration");
console.log("=====================================\n");

console.log("▶ Testing manifest derives values from branding...");

const manifestData = manifest();

// Name and short_name come from branding
assert(
  manifestData.name === branding.name,
  `Manifest name should be "${branding.name}" from branding, got "${manifestData.name}"`
);

assert(
  manifestData.short_name === branding.shortName,
  `Manifest short_name should be "${branding.shortName}" from branding, got "${manifestData.short_name}"`
);

// Description comes from branding
assert(
  manifestData.description === branding.description,
  `Manifest description should match branding.description`
);

// Theme color and background color come from branding
assert(
  manifestData.theme_color === branding.colors.bg,
  `Manifest theme_color should be "${branding.colors.bg}" from branding.colors.bg, got "${manifestData.theme_color}"`
);

assert(
  manifestData.background_color === branding.colors.bg,
  `Manifest background_color should be "${branding.colors.bg}" from branding.colors.bg, got "${manifestData.background_color}"`
);

// Icons come from branding
const iconSrcs = manifestData.icons?.map((icon) => icon.src) || [];

assert(
  iconSrcs.includes(branding.icons.icon192),
  `Manifest icons should include "${branding.icons.icon192}" from branding.icons.icon192`
);

assert(
  iconSrcs.includes(branding.icons.icon512),
  `Manifest icons should include "${branding.icons.icon512}" from branding.icons.icon512`
);

assert(
  iconSrcs.includes(branding.icons.maskable192),
  `Manifest icons should include "${branding.icons.maskable192}" from branding.icons.maskable192`
);

assert(
  iconSrcs.includes(branding.icons.maskable512),
  `Manifest icons should include "${branding.icons.maskable512}" from branding.icons.maskable512`
);

// Check icon purposes are correct
const anyIcons = manifestData.icons?.filter((icon) => icon.purpose?.includes("any")) || [];
const maskableIcons = manifestData.icons?.filter((icon) => icon.purpose?.includes("maskable")) || [];

assert(
  anyIcons.length >= 2,
  `Manifest should have at least 2 icons with "any" purpose (192 and 512), got ${anyIcons.length}`
);

assert(
  maskableIcons.length >= 2,
  `Manifest should have at least 2 icons with "maskable" purpose (192 and 512), got ${maskableIcons.length}`
);

// Standard PWA fields
assert(
  manifestData.display === "standalone",
  `Manifest display should be "standalone", got "${manifestData.display}"`
);

assert(
  manifestData.start_url === "/",
  `Manifest start_url should be "/", got "${manifestData.start_url}"`
);

assert(
  manifestData.scope === "/",
  `Manifest scope should be "/", got "${manifestData.scope}"`
);

console.log("  ✓ Manifest name from branding.name");
console.log("  ✓ Manifest short_name from branding.shortName");
console.log("  ✓ Manifest description from branding.description");
console.log("  ✓ Manifest theme_color from branding.colors.bg");
console.log("  ✓ Manifest background_color from branding.colors.bg");
console.log("  ✓ Manifest icons reference branding.icons paths");
console.log("  ✓ Icon purposes correctly set (any and maskable)");
console.log("  ✓ Manifest display is 'standalone'");
console.log("  ✓ Manifest start_url and scope are '/'");

// Test that manifest would work for all registered brands
console.log("\n▶ Testing manifest would work for all brands...");

const brands = getAllBrands();
for (const brand of brands) {
  assert(
    brand.colors.bg.match(/^#[0-9a-fA-F]{6}$/),
    `Brand "${brand.id}" colors.bg should be a valid hex color`
  );
  
  assert(
    brand.icons.icon192.startsWith("/"),
    `Brand "${brand.id}" icon192 should be an absolute path`
  );
  
  assert(
    brand.icons.icon512.startsWith("/"),
    `Brand "${brand.id}" icon512 should be an absolute path`
  );
}

console.log(`  ✓ All ${brands.length} registered brands have valid colors and icon paths`);

console.log("\n✅ All manifest branding tests passed\n");
