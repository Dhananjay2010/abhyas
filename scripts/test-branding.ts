export {};
/**
 * Test: Enhanced Branding Configuration with Timezone Support
 *
 * Verifies:
 * - Brand selection via NEXT_PUBLIC_BRAND
 * - Color validation (all colors are valid hex codes)
 * - Timezone validation (IANA timezone names)
 * - Fallback behavior when brand not found or invalid
 * - CSS variable generation
 * - Manifest uses branding config
 * - Timezone resolution (config > browser > default)
 */

import { branding, validateTimezone, getBrandCssVariables, getDefaultUnits, type Brand } from "../src/lib/branding";
import {
  getDefaultTimezone,
  resolveTimezoneWithProfile,
} from "../src/lib/timezone";
import manifest from "../src/app/manifest";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testBrandSelection() {
  console.log("\n▶ Testing brand selection...");

  // The active brand should be selected based on NEXT_PUBLIC_BRAND
  assert(typeof branding.id === "string", "branding.id must be a string");
  assert(branding.id.length > 0, "branding.id must not be empty");

  // Default brand is 'default' when NEXT_PUBLIC_BRAND not set
  const expectedId = process.env.NEXT_PUBLIC_BRAND || "default";
  console.log(`  Current NEXT_PUBLIC_BRAND: ${process.env.NEXT_PUBLIC_BRAND || "(not set)"}`);
  console.log(`  Active brand: ${branding.id}`);

  assert(
    branding.id === expectedId || branding.id === "default",
    `Brand should be ${expectedId} or fall back to default (got: ${branding.id})`
  );

  console.log("  ✓ Brand selection working");
}

function testBrandConfig() {
  console.log("\n▶ Testing brand configuration...");

  // Test name and shortName
  assert(
    typeof branding.name === "string" && branding.name.length > 0,
    "branding.name must be a non-empty string"
  );
  assert(
    typeof branding.shortName === "string" && branding.shortName.length > 0,
    "branding.shortName must be a non-empty string"
  );
  if (branding.shortName.length > 12) {
    console.warn(
      `  ⚠ shortName is ${branding.shortName.length} chars (max 12 recommended): "${branding.shortName}"`
    );
  }

  // Test description
  assert(
    typeof branding.description === "string" && branding.description.length > 0,
    "branding.description must be a non-empty string"
  );

  // Test siteUrl
  assert(
    typeof branding.siteUrl === "string" && branding.siteUrl.length > 0,
    "branding.siteUrl must be a non-empty string"
  );
  try {
    new URL(branding.siteUrl);
  } catch {
    throw new Error(`branding.siteUrl must be a valid URL (got: ${branding.siteUrl})`);
  }

  console.log("  ✓ Name, description, and site URL valid");
}

function testBrandColors() {
  console.log("\n▶ Testing brand colors...");

  // All colors must be valid hex codes
  const hexColorRegex = /^#[0-9a-fA-F]{6}$/;
  const colorKeys: (keyof Brand["colors"])[] = [
    "accent",
    "accentHover",
    "accentFg",
    "bg",
    "surface",
    "surface2",
    "border",
    "fg",
    "muted",
    "success",
    "danger",
    "chart",
  ];

  let validCount = 0;
  for (const key of colorKeys) {
    const color = branding.colors[key];
    assert(
      hexColorRegex.test(color),
      `branding.colors.${key} must be a valid hex color (got: ${color})`
    );
    validCount++;
  }

  console.log(`  ✓ All ${validCount} brand colors are valid hex codes`);
}

function testBrandTimezone() {
  console.log("\n▶ Testing brand timezone...");

  if (branding.timezone) {
    console.log(`  Brand has configured timezone: ${branding.timezone}`);

    // If timezone is set, it must be valid
    const validated = validateTimezone(branding.timezone);
    assert(
      validated !== null,
      `branding.timezone must be a valid IANA timezone name (got: ${branding.timezone})`
    );
    console.log(`  ✓ Timezone "${branding.timezone}" is valid`);
  } else {
    console.log("  Brand has no configured timezone (will fall back to browser/default)");
    console.log("  ✓ Optional timezone not set (valid)");
  }

  // Test getDefaultTimezone()
  const defaultTz = getDefaultTimezone();
  assert(typeof defaultTz === "string" && defaultTz.length > 0, "getDefaultTimezone() must return a non-empty string");
  assert(validateTimezone(defaultTz) !== null, `getDefaultTimezone() must return a valid timezone (got: ${defaultTz})`);
  console.log(`  ✓ Default timezone: ${defaultTz}`);
}

function testDefaultUnits() {
  console.log("\n▶ Testing default units...");

  // Test that branding has defaultUnits
  assert(
    branding.defaultUnits === "metric" || branding.defaultUnits === "imperial",
    `branding.defaultUnits must be 'metric' or 'imperial' (got: ${branding.defaultUnits})`
  );
  console.log(`  Brand default units: ${branding.defaultUnits}`);

  // Test getDefaultUnits()
  const units = getDefaultUnits();
  assert(
    units === "metric" || units === "imperial",
    `getDefaultUnits() must return 'metric' or 'imperial' (got: ${units})`
  );
  assert(
    units === branding.defaultUnits,
    `getDefaultUnits() must match branding.defaultUnits (got: ${units}, expected: ${branding.defaultUnits})`
  );
  console.log(`  ✓ getDefaultUnits() returns: ${units}`);
  console.log(`  ✓ Default units configuration valid`);
}

function testTimezoneValidation() {
  console.log("\n▶ Testing timezone validation...");

  // Valid timezones
  const validTimezones = [
    "UTC",
    "America/New_York",
    "Europe/London",
    "Asia/Kolkata",
    "Asia/Tokyo",
    "Australia/Sydney",
  ];

  for (const tz of validTimezones) {
    const result = validateTimezone(tz);
    assert(result === tz, `validateTimezone("${tz}") should return "${tz}" (got: ${result})`);
  }
  console.log(`  ✓ Valid timezones pass: ${validTimezones.join(", ")}`);

  // Invalid timezones
  const invalidTimezones = [
    "Invalid/Timezone",
    "America/InvalidCity",
    "NotATimezone",
    "EST", // deprecated abbreviation
    "",
    null,
    undefined,
  ];

  for (const tz of invalidTimezones) {
    const result = validateTimezone(tz as string);
    assert(
      result === null,
      `validateTimezone(${JSON.stringify(tz)}) should return null (got: ${result})`
    );
  }
  console.log("  ✓ Invalid timezones rejected");
}

function testTimezoneResolution() {
  console.log("\n▶ Testing timezone resolution with profile...");

  // Profile timezone takes priority
  const profileTz = "America/Chicago";
  const resolved = resolveTimezoneWithProfile(profileTz);
  assert(
    resolved === profileTz,
    `resolveTimezoneWithProfile("${profileTz}") should return "${profileTz}" (got: ${resolved})`
  );
  console.log(`  ✓ Profile timezone has priority: ${profileTz}`);

  // Invalid profile timezone falls back to brand default
  const fallback = resolveTimezoneWithProfile("Invalid/Timezone");
  const expected = branding.timezone || "Asia/Kolkata";
  assert(
    fallback === expected,
    `Invalid profile timezone should fall back to brand default "${expected}" (got: ${fallback})`
  );
  console.log(`  ✓ Invalid profile timezone falls back: ${fallback}`);

  // Null/undefined profile timezone falls back to brand default
  const nullFallback = resolveTimezoneWithProfile(null);
  assert(
    nullFallback === expected,
    `null profile timezone should fall back to brand default "${expected}" (got: ${nullFallback})`
  );
  console.log(`  ✓ Null profile timezone falls back: ${nullFallback}`);

  // Profile with database default value, gym has timezone
  // Profile with stored 'Asia/Kolkata' value (explicit user choice)
  const kolkataTz = resolveTimezoneWithProfile("Asia/Kolkata");
  assert(
    kolkataTz === "Asia/Kolkata",
    `Stored 'Asia/Kolkata' should be respected as explicit choice (got: ${kolkataTz})`
  );
  console.log(`  ✓ Stored Asia/Kolkata wins over gym timezone: ${kolkataTz}`);

  // Profile with NULL value should fall back to gym or fallback
  const nullTz2 = resolveTimezoneWithProfile(null);
  const expectedFallback2 = branding.timezone || "Asia/Kolkata";
  assert(
    nullTz2 === expectedFallback2,
    `NULL profile should fall back to gym timezone (got: ${nullTz2}, expected: ${expectedFallback2})`
  );
  console.log(`  ✓ NULL profile falls back to gym timezone: ${nullTz2}`);
}

async function testDayBoundaries() {
  console.log("\n▶ Testing day boundaries across timezones...");

  // Import localDateString dynamically for testing
  const { localDateString } = await import("../src/lib/dates");

  // Test LA time at 23:30 local (should still be same day, not next UTC day)
  const laNight = new Date("2026-01-16T07:30:00.000Z"); // 2026-01-15 23:30 PST
  const laDate = localDateString("America/Los_Angeles", laNight);
  assert(
    laDate === "2026-01-15",
    `LA at 23:30 local should be 2026-01-15 (got: ${laDate})`
  );
  console.log(`  ✓ America/Los_Angeles 23:30 local = ${laDate}`);

  // Test Auckland time at 00:30 local (should be new day, not previous UTC day)
  const aucklandMorning = new Date("2026-01-14T11:30:00.000Z"); // 2026-01-15 00:30 NZDT
  const aucklandDate = localDateString("Pacific/Auckland", aucklandMorning);
  assert(
    aucklandDate === "2026-01-15",
    `Auckland at 00:30 local should be 2026-01-15 (got: ${aucklandDate})`
  );
  console.log(`  ✓ Pacific/Auckland 00:30 local = ${aucklandDate}`);

  // Verify IST is not hardcoded (must use actual timezone)
  const istMorning = new Date("2026-01-14T19:00:00.000Z"); // 2026-01-15 00:30 IST
  const istDate = localDateString("Asia/Kolkata", istMorning);
  assert(
    istDate === "2026-01-15",
    `IST day boundaries should work correctly (got: ${istDate})`
  );
  console.log(`  ✓ Asia/Kolkata respects actual timezone (not hardcoded)`);

  console.log("  ✓ No IST midnight assumptions in day boundary logic");
}

function testCssVariableGeneration() {
  console.log("\n▶ Testing CSS variable generation...");

  const css = getBrandCssVariables(branding);

  // Should be a single-line space-separated list of declarations
  assert(typeof css === "string" && css.length > 0, "CSS variables must be a non-empty string");

  // Must contain all color variables
  const requiredVars = [
    "--color-accent:",
    "--color-accent-hover:",
    "--color-accent-fg:",
    "--color-bg:",
    "--color-surface:",
    "--color-surface-2:",
    "--color-border:",
    "--color-fg:",
    "--color-muted:",
    "--color-success:",
    "--color-danger:",
    "--color-chart:",
  ];

  for (const varName of requiredVars) {
    assert(
      css.includes(varName),
      `CSS variables must include ${varName}`
    );
  }

  // Each declaration should be in format: --var-name: #hex;
  const declarations = css.split(";").filter((d) => d.trim());
  for (const decl of declarations) {
    const trimmed = decl.trim();
    if (trimmed) {
      assert(
        /^--[\w-]+:\s*#[0-9a-fA-F]{6}$/.test(trimmed),
        `Invalid CSS variable declaration: ${trimmed}`
      );
    }
  }

  console.log(`  ✓ Generated ${declarations.length} CSS variable declarations`);
  console.log(`  ✓ All required color variables present`);
  console.log(`  ✓ Format suitable for inline <style> injection`);

  // Test CSS injection protection: invalid colors should throw
  const invalidBrand: Brand = {
    ...branding,
    id: "test-invalid",
    colors: {
      ...branding.colors,
      accent: "javascript:alert(1)", // Invalid: not a hex code
    },
  };

  let threwError = false;
  try {
    getBrandCssVariables(invalidBrand);
  } catch (error) {
    threwError = true;
    assert(
      error instanceof Error && error.message.includes("strict 6-digit hex"),
      `Should throw specific error for invalid color (got: ${error instanceof Error ? error.message : error})`
    );
  }

  assert(
    threwError,
    "getBrandCssVariables must reject invalid colors (CSS injection protection)"
  );
  console.log("  ✓ Invalid colors rejected for CSS injection protection");
}

function testBrandIcons() {
  console.log("\n▶ Testing brand icons...");

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
    typeof branding.icons.appleTouchIcon === "string" &&
      branding.icons.appleTouchIcon.length > 0,
    "branding.icons.appleTouchIcon must be defined"
  );

  console.log("  ✓ All required icon paths defined");
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
    m.theme_color === branding.colors.bg,
    "manifest.theme_color must match branding.colors.bg"
  );
  assert(
    m.background_color === branding.colors.bg,
    "manifest.background_color must match branding.colors.bg"
  );

  // Test manifest structure
  assert(m.display === "standalone", "manifest.display must be 'standalone'");
  assert(m.start_url === "/", "manifest.start_url must be '/'");
  assert(m.scope === "/", "manifest.scope must be '/'");
  // ID should be stable and derived from brand ID
  assert(
    typeof m.id === "string" && m.id.includes(branding.id),
    `manifest.id must be stable and include brand ID (got: ${m.id})`
  );
  // Orientation should not be locked (removed for accessibility)
  assert(
    !m.orientation || m.orientation === "any",
    `manifest.orientation should not lock to portrait (got: ${m.orientation})`
  );

  // Test icons array
  assert(
    Array.isArray(m.icons) && m.icons.length >= 4,
    "manifest.icons must have at least 4 icons"
  );

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

  // Test screenshots array
  assert(
    Array.isArray(m.screenshots) && m.screenshots.length >= 2,
    "manifest.screenshots must have at least 2 screenshots (narrow and wide)"
  );

  const screenshotFormFactors = m.screenshots?.map((s) => s.form_factor) ?? [];
  assert(
    screenshotFormFactors.includes("narrow"),
    "manifest must include a screenshot with form_factor 'narrow'"
  );
  assert(
    screenshotFormFactors.includes("wide"),
    "manifest must include a screenshot with form_factor 'wide'"
  );

  const screenshotSrcs = m.screenshots?.map((s) => s.src) ?? [];
  assert(
    screenshotSrcs.some((src) => src.includes("screenshot-narrow")),
    "manifest must include screenshot-narrow.png"
  );
  assert(
    screenshotSrcs.some((src) => src.includes("screenshot-wide")),
    "manifest must include screenshot-wide.png"
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

async function main() {
  console.log("Testing Enhanced Branding Configuration with Timezone Support");
  console.log("==============================================================");

  try {
    testBrandSelection();
    testBrandConfig();
    testBrandColors();
    testBrandTimezone();
    testDefaultUnits();
    testTimezoneValidation();
    testTimezoneResolution();
    await testDayBoundaries();
    testCssVariableGeneration();
    testBrandIcons();
    testManifestUsesConfig();
    testManifestShortcuts();

    console.log("\n✅ All branding and timezone tests passed");
    console.log(`\nActive brand: ${branding.name} (${branding.id})`);
    console.log(`Site URL: ${branding.siteUrl}`);
    console.log(`Timezone: ${branding.timezone || "(browser fallback)"}`);
    console.log(`Default units: ${branding.defaultUnits}`);
    console.log(`Colors: ${branding.colors.accent} (accent), ${branding.colors.bg} (background)\n`);

    process.exit(0);
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
