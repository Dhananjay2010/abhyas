#!/usr/bin/env tsx

/**
 * Test: M10c behavioral - verify renderLandingPage wires resolved brand
 * 
 * Tests that renderLandingPage (extracted from page.tsx) properly wires the
 * resolved brand from getRequestBrandResolution through to LandingContent.
 * 
 * M10c mutant: renderLandingPage passes brand={branding} (static) instead of
 * the resolved brand from buildLandingBrandProp.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { branding, type Brand } from "@/lib/branding";
import type { BrandResolution } from "@/lib/runtime-brand";
import { renderLandingPage } from "@/app/render-landing-page";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

// Custom brand for testing
const customBrand: Brand = {
  id: "custom",
  name: "Iron Temple Gym",
  shortName: "Iron Temple",
  description: "A custom gym experience",
  siteUrl: "https://iron-temple.example.com",
  timezone: "America/Los_Angeles",
  tagline: "Train Different",
  defaultUnits: "metric",
  colors: {
    accent: "#FF6600",
    accentHover: "#FF7700",
    accentFg: "#FFFFFF",
    bg: "#0a0c0e",
    surface: "#1a1c1e",
    surface2: "#2a2c2e",
    border: "#3a3c3e",
    fg: "#FFFFFF",
    muted: "#AAAAAA",
    success: "#00FF00",
    warning: "#FFFF00",
    warningFg: "#000000",
    danger: "#FF0000",
    chart: "#0000FF",
  },
  icons: {
    icon192: "/custom-192.png",
    icon512: "/custom-512.png",
    maskable192: "/custom-maskable-192.png",
    maskable512: "/custom-maskable-512.png",
    appleTouchIcon: "/custom-apple.png",
    favicon: "/custom-favicon.ico",
  },
  logo: "/custom-logo.png",
};

const customResolution: BrandResolution = {
  tier: "host",
  brand: customBrand,
  gymId: "gym_123",
  gymName: "Iron Temple Gym",
};

async function testRenderLandingPageWithCustomBrand() {
  console.log("TEST: M10c behavioral - renderLandingPage wires resolved brand");
  
  // Stub deps: no user, custom brand resolution
  const stubDeps = {
    getAuthedClient: async () => ({
      supabase: null as any,
      user: null,
    }),
    getRequestBrandResolution: async () => customResolution,
    redirect: ((_url: string) => {
      throw new Error("Should not redirect for non-authenticated user");
    }) as any,
  };
  
  const element = await renderLandingPage({ error: undefined, next: undefined }, stubDeps);
  const html = renderToStaticMarkup(element);
  
  // Check that custom brand name appears
  check("M10c: Custom brand name in page output", 
    html.includes("Iron Temple Gym"),
    html.includes("Iron Temple Gym") ? "" : "Custom brand name not found"
  );
  
  // Check that custom tagline appears
  check("M10c: Custom brand tagline in page output", 
    html.includes("Train Different"),
    html.includes("Train Different") ? "" : "Custom tagline not found"
  );
  
  // Check that custom description appears
  check("M10c: Custom brand description in page output", 
    html.includes("A custom gym experience"),
    html.includes("A custom gym experience") ? "" : "Custom description not found"
  );
  
  // Check that custom logo path is used
  check("M10c: Custom brand logo in page output", 
    html.includes("/custom-logo.png") || html.includes("custom-logo"),
    html.includes("custom-logo") ? "" : "Custom logo not found"
  );
}

async function testRenderLandingPageWithBaseBrand() {
  console.log("\nTEST: M10c control - renderLandingPage with base brand");
  
  const baseResolution: BrandResolution = {
    tier: "base",
    brand: branding,
    gymId: null,
    gymName: null,
  };
  
  const stubDeps = {
    getAuthedClient: async () => ({
      supabase: null as any,
      user: null,
    }),
    getRequestBrandResolution: async () => baseResolution,
    redirect: ((_url: string) => {
      throw new Error("Should not redirect for non-authenticated user");
    }) as any,
  };
  
  const element = await renderLandingPage({ error: undefined, next: undefined }, stubDeps);
  const html = renderToStaticMarkup(element);
  
  // Check that base brand name appears
  check("M10c control: Base brand name in output", 
    html.includes(branding.name)
  );
  
  // Should NOT contain custom brand name when using base brand
  check("M10c control: Custom brand name NOT in base output", 
    !html.includes("Iron Temple Gym")
  );
}

async function main() {
  await testRenderLandingPageWithCustomBrand();
  await testRenderLandingPageWithBaseBrand();
  
  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed`);
    process.exit(1);
  }
  
  console.log("\n✅ All M10c behavioral tests passed");
  console.log("\nThis test verifies the real page.tsx → renderLandingPage wiring.");
  console.log("Mutant: renderLandingPage using static branding instead of resolved brand.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
