#!/usr/bin/env tsx
/**
 * Test: Landing page copy is truthful
 *
 * Verifies the landing page claims are accurate to the product and brand-neutral.
 * Renders the REAL src/app/page.tsx and asserts on the actual DOM output.
 */

// CRITICAL: Set up globalThis.AsyncLocalStorage BEFORE any Next.js modules load
import { AsyncLocalStorage } from "async_hooks";
globalThis.AsyncLocalStorage = AsyncLocalStorage;
process.env.NEXT_RUNTIME = "nodejs";

// Set up minimal Supabase environment variables for testing
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { branding } from "../src/lib/branding";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "✗ FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  console.log("Test Landing Copy\n");

  console.log("1. Rendered landing page has truthful, brand-neutral copy");

  // Import the Next.js storage modules
  const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external");
  const { workUnitAsyncStorage } = await import("next/dist/server/app-render/work-unit-async-storage.external");

  // Mock work store with forceStatic to bypass cookies requirement
  const mockWorkStore = {
    forceStatic: true,
    route: "/",
    isStaticGeneration: true,
    dynamicShouldError: false,
  };
  
  // Mock work unit store for rendering phase
  const mockWorkUnitStore = {
    type: "request",
    phase: "render",
  };

  // Run within Next.js's actual async storage contexts
  await workAsyncStorage.run(mockWorkStore, async () => {
    await workUnitAsyncStorage.run(mockWorkUnitStore, async () => {
      // Import and render the REAL landing page component
      const { default: LandingPage } = await import("../src/app/page");
      
      // Call it as Next.js would, with searchParams as a Promise
      const searchParams = Promise.resolve({});
      const pageElement = await LandingPage({ searchParams });
      
      // Render to static HTML
      const html = renderToStaticMarkup(pageElement);
      
      // Parse with JSDOM
      const dom = new JSDOM(html);
      const text = dom.window.document.body.textContent ?? "";

      // Positive assertions: new truthful copy
      check(
        "Has warm-up/cool-down claim",
        text.includes("Warm-up and cool-down built into every session"),
      );

      // Negative assertions: old duration promises absent
      check(
        "No 'One hour a day' claim",
        !text.includes("One hour a day"),
      );

      check(
        "No '15 minute' claims",
        !text.includes("15 minute") && !text.includes("15-minute") && !text.includes("15 minutes of warm-up"),
      );

      // Brand neutrality: content comes from config
      check(
        "Brand name from config",
        text.includes(branding.name),
      );

      check(
        "Description from config",
        text.includes(branding.description),
      );
    });
  });

  if (failures > 0) {
    console.log(`\n✗ ${failures} check(s) failed`);
    process.exit(1);
  }

  console.log("\n✓ All landing copy checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
