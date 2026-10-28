#!/usr/bin/env node
/**
 * Test: MUTANT M11 - BrandLogo component uses runtime brand
 * 
 * Tests that BrandLogo renders with the brand passed as prop,
 * and that LandingContent passes brand={brand}.
 * Mutant: Drop brand={brand} prop from landing-content.tsx or 
 * make BrandLogo ignore the prop.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { BrandLogo } from "../src/components/brand-logo";
import { LandingContent } from "../src/app/landing-content";
import { branding } from "../src/lib/branding";
import type { Brand } from "../src/lib/branding";
import React from "react";

// Stub brand WITHOUT logo (will render text fallback as <span>)
const stubBrandNoLogo: Brand = {
  id: "test-gym-id",
  name: "Iron Temple Gym",
  shortName: "Iron Temple",
  colors: branding.colors,
  siteUrl: branding.siteUrl,
  description: "Train like a warrior at Iron Temple",
  supportEmail: branding.supportEmail,
  defaultUnits: branding.defaultUnits,
  icons: branding.icons,
};

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

function main() {
  console.log("TEST: MUTANT M11 - BrandLogo uses runtime brand prop");

  // Test BrandLogo directly with stub brand that has logo
  {
    const stubWithLogo: Brand = {
      ...stubBrandNoLogo,
      logo: "/stub-logo.svg",
    };

    const html = renderToStaticMarkup(
      React.createElement(BrandLogo, { brand: stubWithLogo })
    );

    check(
      "M11: BrandLogo with stub logo renders stub src",
      html.includes("/stub-logo.svg")
    );
    check(
      "M11: BrandLogo with stub logo uses stub alt text",
      html.includes(stubWithLogo.name)
    );
  }

  // Test BrandLogo directly with stub brand (no logo, renders <span> text)
  {
    const html = renderToStaticMarkup(
      React.createElement(BrandLogo, { brand: stubBrandNoLogo })
    );

    check(
      "M11: BrandLogo renders stub name in span",
      html.includes("<span") && html.includes(stubBrandNoLogo.name)
    );
    check(
      "M11: BrandLogo does NOT render base brand name",
      !html.includes(branding.name)
    );
  }

  // Test BrandLogo with base branding (should render base name)
  {
    const html = renderToStaticMarkup(
      React.createElement(BrandLogo, { brand: branding })
    );

    check(
      "M11: BrandLogo with base brand renders base name",
      html.includes(branding.name)
    );
  }

  // Test LandingContent passes brand prop to BrandLogo
  // When logo is undefined, LandingContent renders brand.name in an h1,
  // and BrandLogo is not used. So use a brand WITH a logo.
  {
    const stubBrandWithLogo: Brand = {
      ...stubBrandNoLogo,
      logo: "/test-logo.svg", // Relative path, won't trigger Next.js Image validation
    };

    const html = renderToStaticMarkup(
      React.createElement(LandingContent, { brand: stubBrandWithLogo })
    );

    // When brand.logo exists, LandingContent renders BrandLogo + small h1
    // BrandLogo will try to render <img> with the logo
    check(
      "M11: LandingContent with logo brand renders logo src",
      html.includes("/test-logo.svg")
    );
    check(
      "M11: LandingContent renders stub name",
      html.includes(stubBrandWithLogo.name)
    );
    check(
      "M11: LandingContent renders stub description",
      html.includes(stubBrandWithLogo.description)
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
