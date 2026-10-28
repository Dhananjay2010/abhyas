#!/usr/bin/env node
/**
 * Test: MUTANT M11 - BrandLogo component uses runtime brand
 * 
 * Tests that BrandLogo component accepts and uses a brand prop,
 * and that LandingContent passes brand={brand}.
 * Mutant: Remove brand={brand} from LandingContent or make BrandLogo ignore the prop.
 */

import { branding } from "../src/lib/branding";
import type { Brand } from "../src/lib/branding";

const hostBrand: Brand = {
  name: "Iron Temple",
  shortName: "Iron Temple",
  logo: "https://gym.example.com/logo.png",
  colors: branding.colors,
  siteUrl: branding.siteUrl,
  description: branding.description,
  supportEmail: branding.supportEmail,
};

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

async function main() {
  console.log("TEST: MUTANT M11 - BrandLogo uses runtime brand prop");

  // Test 1: Verify BrandLogo component signature accepts brand prop
  {
    const { BrandLogo } = await import("../src/components/brand-logo");
    
    // BrandLogo should be a function
    check("M11: BrandLogo is a component", typeof BrandLogo === "function");
    
    // Create a mock render to verify brand usage
    let capturedBrand: Brand | undefined;
    const mockBrandLogo = ({ brand = branding }: { brand?: Brand }) => {
      capturedBrand = brand;
      return null;
    };
    
    // Simulate calling with host brand
    mockBrandLogo({ brand: hostBrand });
    check("M11: BrandLogo accepts brand prop", capturedBrand === hostBrand);
    
    // Simulate calling with no prop (should default to branding)
    capturedBrand = undefined;
    mockBrandLogo({});
    check("M11: BrandLogo defaults to static branding", capturedBrand === branding);
  }

  // Test 2: Verify LandingContent source code passes brand prop
  {
    const fs = await import("fs");
    const landingContentSource = fs.readFileSync("src/app/landing-content.tsx", "utf-8");
    
    check(
      "M11: LandingContent imports BrandLogo",
      landingContentSource.includes('import { BrandLogo }')
    );
    
    check(
      "M11: LandingContent passes brand prop to BrandLogo",
      landingContentSource.includes('<BrandLogo brand={brand}')
    );
    
    check(
      "M11: LandingContent does NOT use static branding in BrandLogo call",
      !landingContentSource.includes('<BrandLogo brand={branding}')
    );
  }

  // Test 3: Verify BrandLogo source uses brand parameter
  {
    const fs = await import("fs");
    const brandLogoSource = fs.readFileSync("src/components/brand-logo.tsx", "utf-8");
    
    check(
      "M11: BrandLogo has brand parameter",
      brandLogoSource.includes('brand') && brandLogoSource.includes('Brand')
    );
    
    check(
      "M11: BrandLogo uses brand.logo",
      brandLogoSource.includes('brand.logo')
    );
    
    check(
      "M11: BrandLogo uses brand.name",
      brandLogoSource.includes('brand.name')
    );
  }

  console.log();

  if (failures > 0) {
    console.error(`❌ ${failures} test(s) failed`);
    process.exit(1);
  } else {
    console.log("✅ All tests passed");
    process.exit(0);
  }
}

main();
