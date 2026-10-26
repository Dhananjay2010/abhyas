#!/usr/bin/env tsx
/**
 * Test: Landing page copy is truthful
 *
 * Verifies the landing page claims are accurate to the product and brand-neutral.
 * Renders the presentational LandingContent component and asserts on the actual DOM output.
 */

import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { branding } from "../src/lib/branding";
import { LandingContent } from "../src/app/landing-content";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "✗ FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  console.log("Test Landing Copy\n");

  console.log("1. Rendered landing page has truthful, brand-neutral copy");

  // Render the presentational component with no auth state
  const html = renderToStaticMarkup(<LandingContent />);
  
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
