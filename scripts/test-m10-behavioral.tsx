#!/usr/bin/env tsx

/**
 * Test: M10c behavioral - verify LandingContent receives resolved brand
 * 
 * Tests that LandingContent component properly receives and renders the brand
 * prop by checking that custom brand name and logo appear in the output.
 * 
 * M10c mutant: page.tsx passes brand={branding} (static) instead of brand={brand} (resolved)
 */

import { renderToStaticMarkup } from "react-dom/server";
import { branding, type Brand } from "@/lib/branding";
import { LandingContent } from "@/app/landing-content";

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

async function testLandingContentWithCustomBrand() {
  console.log("TEST: M10c behavioral - LandingContent receives custom brand");
  
  const html = renderToStaticMarkup(
    <LandingContent 
      brand={customBrand}
      error={undefined}
      next={undefined}
    />
  );
  
  // Check that custom brand name appears
  check("M10c: Custom brand name rendered", 
    html.includes("Iron Temple Gym"),
    html.includes("Iron Temple Gym") ? "" : "Custom brand name not found"
  );
  
  // Check that custom tagline appears
  check("M10c: Custom brand tagline rendered", 
    html.includes("Train Different"),
    html.includes("Train Different") ? "" : "Custom tagline not found"
  );
  
  // Check that custom logo path is passed to BrandLogo
  check("M10c: Custom brand logo rendered", 
    html.includes("/custom-logo.png") || html.includes("custom-logo"),
    html.includes("custom-logo") ? "" : "Custom logo not found"
  );
  
  // Check that custom description appears
  check("M10c: Custom brand description rendered", 
    html.includes("A custom gym experience"),
    html.includes("A custom gym experience") ? "" : "Custom description not found"
  );
}

async function testLandingContentWithBaseBrand() {
  console.log("\nTEST: M10c control - LandingContent with base brand");
  
  const html = renderToStaticMarkup(
    <LandingContent 
      brand={branding}
      error={undefined}
      next={undefined}
    />
  );
  
  // Check that base brand name appears
  check("M10c control: Base brand name rendered", 
    html.includes(branding.name),
    html.includes(branding.name) ? "" : "Base brand name not found"
  );
  
  // Should NOT contain custom brand name when using base brand
  check("M10c control: Custom brand name NOT in base", 
    !html.includes("Iron Temple Gym"),
    !html.includes("Iron Temple Gym") ? "" : "Custom brand leaked into base render"
  );
}

async function main() {
  await testLandingContentWithCustomBrand();
  await testLandingContentWithBaseBrand();
  
  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed`);
    process.exit(1);
  }
  
  console.log("\n✅ All M10c behavioral tests passed");
  console.log("\nNote: This test verifies LandingContent renders the brand prop.");
  console.log("The wiring from page.tsx buildLandingBrandProp() is tested separately.");
  console.log("Full end-to-end requires async server component rendering.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
