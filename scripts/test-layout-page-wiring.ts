#!/usr/bin/env tsx

/**
 * Test M10a, M10b, M10c: wiring mutants for layout/page brand props.
 *
 * M10a: layout.tsx generateMetadata using static branding instead of resolved brand
 * M10b: layout's CSS vars using static branding instead of resolved brand
 * M10c: page.tsx dropping brand={brand} from LandingContent
 *
 * Each mutant must fail a NAMED test.
 */

import { strict as assert } from "assert";
import type { BrandResolution, Brand } from "@/lib/runtime-brand";
import { buildRootLayoutBrandProps } from "@/lib/layout-props";
import { buildLandingBrandProp } from "@/lib/landing-props";
import { branding as defaultBrand } from "@/lib/branding";

// Stub resolvers
const customBrand: Brand = {
  id: "custom",
  name: "Custom Gym",
  tagline: "Train Different",
  description: "A custom gym experience",
  defaultUnits: "metric",
  colors: {
    accent: "#FF6600",
    accentHover: "#FF7700",
    accentFg: "#FFFFFF",
    bg: "#FF0000",
    surface: "#FF1111",
    surface2: "#FF2222",
    border: "#FF3333",
    fg: "#FFFFFF",
    muted: "#FFCCCC",
    success: "#00FF00",
    warning: "#FFFF00",
    warningFg: "#000000",
    danger: "#FF0000",
    chart: "#0000FF",
  },
  logo: { url: "https://example.com/logo.png", alt: "Custom Logo" },
};

const customResolution: BrandResolution = {
  tier: "host",
  brand: customBrand,
  metadata: { gymId: "gym_123", hostDomain: "custom.example.com" },
};

async function getCustomResolution(): Promise<BrandResolution> {
  return customResolution;
}

async function getDefaultResolution(): Promise<BrandResolution> {
  return {
    tier: "base",
    brand: defaultBrand,
    metadata: {},
  };
}

async function testM10aMetadata() {
  console.log("M10a: Layout metadata should use resolved brand");
  
  const { metadata } = await buildRootLayoutBrandProps(getCustomResolution);
  
  assert.ok(metadata.title, "Metadata should have title");
  assert.equal(
    metadata.title,
    customBrand.name,
    "M10a: Metadata title must be resolved custom brand name, not static default"
  );
  
  console.log("  ✓ M10a: Metadata uses resolved brand");
}

async function testM10bCssVars() {
  console.log("M10b: Layout CSS vars should use resolved brand");
  
  const { brandCssVars } = await buildRootLayoutBrandProps(getCustomResolution);
  
  // CSS vars use --color-* custom properties
  assert.ok(brandCssVars.includes("--color-accent:"),
    "M10b: CSS vars must include --color-accent definition");
  assert.ok(brandCssVars.includes("--color-bg:"),
    "M10b: CSS vars must include --color-bg definition");
  
  // Verify the actual custom colors are used (case-insensitive hex)
  assert.ok(brandCssVars.toLowerCase().includes(customBrand.colors.accent.toLowerCase()),
    `M10b: CSS vars must include resolved custom brand accent color ${customBrand.colors.accent}, not static default`);
  assert.ok(brandCssVars.toLowerCase().includes(customBrand.colors.bg.toLowerCase()),
    `M10b: CSS vars must include resolved custom brand bg color ${customBrand.colors.bg}, not static default`);
  
  // Should NOT contain default brand colors
  const defaultCssVars = (await buildRootLayoutBrandProps(getDefaultResolution)).brandCssVars;
  assert.notEqual(
    brandCssVars,
    defaultCssVars,
    "M10b: Custom brand CSS vars must differ from default brand CSS vars"
  );
  
  console.log("  ✓ M10b: CSS vars use resolved brand");
}

async function testM10cLandingBrand() {
  console.log("M10c: Landing page should pass resolved brand");
  
  const { brand } = await buildLandingBrandProp(getCustomResolution);
  
  assert.equal(
    brand.name,
    customBrand.name,
    "M10c: Landing brand must be resolved custom brand, not static default or missing"
  );
  assert.equal(
    brand.colors.accent,
    customBrand.colors.accent,
    "M10c: Landing brand colors must be resolved custom brand colors"
  );
  
  console.log("  ✓ M10c: Landing page receives resolved brand");
}

async function testDefaultResolution() {
  console.log("Identity: Default resolution should work");
  
  const { brand, metadata } = await buildRootLayoutBrandProps(getDefaultResolution);
  assert.equal(brand.name, defaultBrand.name);
  assert.equal(metadata.title, defaultBrand.name);
  
  const landing = await buildLandingBrandProp(getDefaultResolution);
  assert.equal(landing.brand.name, defaultBrand.name);
  
  console.log("  ✓ Default resolution works");
}

async function main() {
  await testM10aMetadata();
  await testM10bCssVars();
  await testM10cLandingBrand();
  await testDefaultResolution();
  
  console.log("\n✓ All M10 wiring tests passed");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
