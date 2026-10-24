/**
 * Test: Branding configuration
 *
 * Verifies that the centralized branding config is valid and consistent,
 * that the manifest uses it correctly, and that all icon files exist.
 */

import { branding } from "../src/lib/branding";
import manifest from "../src/app/manifest";
import * as fs from "fs";
import * as path from "path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testBrandingConfig() {
  console.log("\n▶ Testing branding config...");

  // Test name and shortName
  assert(
    typeof branding.name === "string" && branding.name.length > 0,
    "branding.name must be a non-empty string"
  );
  assert(
    typeof branding.shortName === "string" && branding.shortName.length > 0,
    "branding.shortName must be a non-empty string"
  );
  assert(
    branding.shortName.length <= 12,
    "branding.shortName should be 12 chars or less for home screen display"
  );

  // Test description
  assert(
    typeof branding.description === "string" && branding.description.length > 0,
    "branding.description must be a non-empty string"
  );

  // Test colors are valid hex codes
  const hexColorRegex = /^#[0-9a-fA-F]{6}$/;
  assert(
    hexColorRegex.test(branding.themeColor),
    `branding.themeColor must be a valid hex color (got: ${branding.themeColor})`
  );
  assert(
    hexColorRegex.test(branding.backgroundColor),
    `branding.backgroundColor must be a valid hex color (got: ${branding.backgroundColor})`
  );

  // Test icon paths
  const iconPaths = Object.values(branding.icons);
  assert(iconPaths.length > 0, "branding.icons must contain at least one icon path");

  for (const path of iconPaths) {
    assert(
      typeof path === "string" && path.startsWith("/"),
      `Icon path must be an absolute path starting with / (got: ${path})`
    );
  }

  // Test required icon sizes exist
  assert(
    typeof branding.icons.favicon === "string" && branding.icons.favicon.length > 0,
    "branding.icons.favicon must be defined"
  );
  assert(
    typeof branding.icons.icon192 === "string" && branding.icons.icon192.length > 0,
    "branding.icons.icon192 must be defined"
  );
  assert(
    typeof branding.icons.icon512 === "string" && branding.icons.icon512.length > 0,
    "branding.icons.icon512 must be defined"
  );
  assert(
    typeof branding.icons.maskable192 === "string" && branding.icons.maskable192.length > 0,
    "branding.icons.maskable192 must be defined"
  );
  assert(
    typeof branding.icons.maskable512 === "string" && branding.icons.maskable512.length > 0,
    "branding.icons.maskable512 must be defined"
  );
  assert(
    typeof branding.icons.appleTouchIcon === "string" && branding.icons.appleTouchIcon.length > 0,
    "branding.icons.appleTouchIcon must be defined"
  );

  console.log("  ✓ Name and short name valid");
  console.log("  ✓ Description present");
  console.log("  ✓ Theme and background colors are valid hex");
  console.log("  ✓ All required icon paths defined (favicon + PWA icons)");
}

function testIconFilesExist() {
  console.log("\n▶ Testing icon files exist on disk...");

  const publicDir = path.join(__dirname, "..", "public");

  // Check each icon path from branding config
  const iconPaths = [
    { key: "favicon", path: branding.icons.favicon },
    { key: "icon192", path: branding.icons.icon192 },
    { key: "icon512", path: branding.icons.icon512 },
    { key: "maskable192", path: branding.icons.maskable192 },
    { key: "maskable512", path: branding.icons.maskable512 },
    { key: "appleTouchIcon", path: branding.icons.appleTouchIcon },
  ];

  for (const { key, path: iconPath } of iconPaths) {
    // Icon paths in branding are relative to public/ (e.g. "/icons/icon-192.png")
    // Remove leading slash and resolve from public directory
    const relativePath = iconPath.startsWith("/") ? iconPath.slice(1) : iconPath;
    const fullPath = path.join(publicDir, relativePath);

    assert(
      fs.existsSync(fullPath),
      `Icon file must exist: ${key} at ${fullPath} (from branding.icons.${key} = "${iconPath}")`
    );

    const stats = fs.statSync(fullPath);
    assert(
      stats.isFile() && stats.size > 0,
      `Icon must be a non-empty file: ${key} at ${fullPath}`
    );
  }

  console.log("  ✓ All icon files exist in public/");
  console.log(`  ✓ favicon: ${branding.icons.favicon}`);
  console.log(`  ✓ icon192: ${branding.icons.icon192}`);
  console.log(`  ✓ icon512: ${branding.icons.icon512}`);
  console.log(`  ✓ maskable192: ${branding.icons.maskable192}`);
  console.log(`  ✓ maskable512: ${branding.icons.maskable512}`);
  console.log(`  ✓ appleTouchIcon: ${branding.icons.appleTouchIcon}`);
}

function testManifestUsesConfig() {
  console.log("\n▶ Testing manifest uses branding config...");

  const m = manifest();

  // Test that manifest reads from branding config
  assert(m.name === branding.name, "manifest.name must match branding.name");
  assert(
    m.short_name === branding.shortName,
    "manifest.short_name must match branding.shortName"
  );
  assert(
    m.description === branding.description,
    "manifest.description must match branding.description"
  );
  assert(
    m.theme_color === branding.themeColor,
    "manifest.theme_color must match branding.themeColor"
  );
  assert(
    m.background_color === branding.backgroundColor,
    "manifest.background_color must match branding.backgroundColor"
  );

  // Test manifest structure
  assert(m.display === "standalone", "manifest.display must be 'standalone'");
  assert(m.start_url === "/", "manifest.start_url must be '/'");
  assert(m.orientation === "portrait", "manifest.orientation must be 'portrait'");

  // Test icons array
  assert(Array.isArray(m.icons) && m.icons.length >= 4, "manifest.icons must have at least 4 icons");

  // Test that manifest icons reference branding icon paths
  const manifestIconSrcs = m.icons?.map((icon) => icon.src) ?? [];
  assert(
    manifestIconSrcs.includes(branding.icons.icon192),
    "manifest must include branding.icons.icon192"
  );
  assert(
    manifestIconSrcs.includes(branding.icons.icon512),
    "manifest must include branding.icons.icon512"
  );
  assert(
    manifestIconSrcs.includes(branding.icons.maskable192),
    "manifest must include branding.icons.maskable192"
  );
  assert(
    manifestIconSrcs.includes(branding.icons.maskable512),
    "manifest must include branding.icons.maskable512"
  );

  // Test maskable icons have correct purpose
  const maskableIcons = m.icons?.filter((icon) => icon.purpose === "maskable") ?? [];
  assert(
    maskableIcons.length >= 2,
    "manifest must have at least 2 maskable icons (for Android adaptive icons)"
  );

  console.log("  ✓ Manifest name, description, and colors match branding config");
  console.log("  ✓ Manifest structure is valid");
  console.log("  ✓ Manifest icons reference branding icon paths");
  console.log("  ✓ Maskable icons present for Android adaptive icons");
}

function testMetadataUsesBrandingIcons() {
  console.log("\n▶ Testing metadata references branding icons...");

  // We can't import layout.tsx metadata directly in this test,
  // but we can verify the branding config has all required paths
  // that should be used in layout.tsx metadata.icons

  assert(
    typeof branding.icons.favicon === "string",
    "branding.icons.favicon must be defined for metadata.icons.icon"
  );
  assert(
    typeof branding.icons.icon192 === "string",
    "branding.icons.icon192 must be defined for metadata.icons.icon"
  );
  assert(
    typeof branding.icons.icon512 === "string",
    "branding.icons.icon512 must be defined for metadata.icons.icon"
  );
  assert(
    typeof branding.icons.appleTouchIcon === "string",
    "branding.icons.appleTouchIcon must be defined for metadata.icons.apple"
  );

  console.log("  ✓ Branding config provides all required icon paths for metadata");
  console.log("  ✓ Favicon path available for metadata.icons.icon");
  console.log("  ✓ PWA icons (192, 512) available for metadata.icons.icon");
  console.log("  ✓ Apple touch icon available for metadata.icons.apple");
}

function testManifestShortcuts() {
  console.log("\n▶ Testing manifest shortcuts...");

  const m = manifest();

  assert(
    typeof m.shortcuts !== "undefined" && Array.isArray(m.shortcuts),
    "manifest.shortcuts must be an array"
  );
  assert(
    typeof m.shortcuts !== "undefined" && m.shortcuts.length > 0,
    "manifest.shortcuts should have at least one shortcut"
  );

  for (const shortcut of m.shortcuts || []) {
    assert(typeof shortcut.name === "string", "shortcut.name must be a string");
    assert(typeof shortcut.url === "string", "shortcut.url must be a string");
    assert(shortcut.url.startsWith("/"), "shortcut.url must be an absolute path");
  }

  console.log("  ✓ Shortcuts are valid");
}

function main() {
  console.log("Testing Branding Configuration");
  console.log("================================");

  try {
    testBrandingConfig();
    testIconFilesExist();
    testManifestUsesConfig();
    testMetadataUsesBrandingIcons();
    testManifestShortcuts();

    console.log("\n✅ All branding tests passed\n");
    process.exit(0);
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
