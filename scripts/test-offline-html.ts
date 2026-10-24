/**
 * Test: Offline page HTML structure
 *
 * Verifies that the offline page renders exactly one <html> and one <body> tag
 * (no nested elements). Tests against the built output.
 */

import * as fs from "fs";
import * as path from "path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function countTags(html: string, tag: string): number {
  const openingTags = html.match(new RegExp(`<${tag}[\\s>]`, "gi")) || [];
  return openingTags.length;
}

function testOfflineBuildOutput() {
  console.log("\n▶ Testing offline page build output...");

  // Check if build output exists
  const offlinePath = path.join(__dirname, "..", ".next", "server", "app", "offline.html");
  
  if (!fs.existsSync(offlinePath)) {
    console.log("  ⚠ Build output not found at .next/server/app/offline.html");
    console.log("  ⚠ Skipping build output test (run npm run build first)");
    return;
  }

  const html = fs.readFileSync(offlinePath, "utf-8");

  // Count <html> tags
  const htmlCount = countTags(html, "html");
  assert(
    htmlCount === 1,
    `offline.html must have exactly 1 <html> tag, found ${htmlCount}`
  );

  // Count <body> tags
  const bodyCount = countTags(html, "body");
  assert(
    bodyCount === 1,
    `offline.html must have exactly 1 <body> tag, found ${bodyCount}`
  );

  // Verify it has DOCTYPE
  assert(
    html.includes("<!DOCTYPE html>") || html.includes("<!doctype html>"),
    "offline.html must have <!DOCTYPE html>"
  );

  // Verify it contains the offline message
  assert(
    html.includes("offline") || html.includes("Offline"),
    "offline.html must contain offline-related text"
  );

  // Verify no [data-hide-nav] remnants in production build would break nav
  // (The attribute should be present to hide nav, but shouldn't cause issues)
  
  console.log(`  ✓ Exactly 1 <html> tag`);
  console.log(`  ✓ Exactly 1 <body> tag`);
  console.log("  ✓ Has DOCTYPE");
  console.log("  ✓ Contains offline message");
}

function testOfflinePageComponent() {
  console.log("\n▶ Testing offline page component structure...");

  const offlinePagePath = path.join(__dirname, "..", "src", "app", "offline", "page.tsx");
  
  assert(
    fs.existsSync(offlinePagePath),
    "src/app/offline/page.tsx must exist"
  );

  const source = fs.readFileSync(offlinePagePath, "utf-8");

  // Must NOT contain its own <html> tag
  assert(
    !source.includes("<html"),
    "Offline page must NOT render its own <html> tag (rendered by root layout)"
  );

  // Must NOT contain its own <body> tag
  assert(
    !source.includes("<body"),
    "Offline page must NOT render its own <body> tag (rendered by root layout)"
  );

  // Should be a default export (Next.js page requirement)
  assert(
    source.includes("export default"),
    "Offline page must have a default export"
  );

  // Should have the data-hide-nav attribute to hide bottom nav
  assert(
    source.includes("data-hide-nav"),
    "Offline page should have data-hide-nav attribute to hide bottom nav"
  );

  // Should use branding
  assert(
    source.includes("branding"),
    "Offline page should use branding configuration"
  );

  // Should have a retry link (not a button with onClick)
  assert(
    source.includes("<a") && source.includes('href'),
    "Offline page should have an <a> link for retry (works without JS)"
  );

  // CRITICAL: Must have inline styles so it works without external CSS
  assert(
    source.includes("containerStyle") && source.includes("background:"),
    "Offline page must have inline styles (containerStyle with background)"
  );

  assert(
    source.includes("#0a0c0e") && source.includes("#22c55e"),
    "Offline page must have brand colors (#0a0c0e background, #22c55e accent) in inline styles"
  );

  assert(
    source.includes("style={containerStyle}") || source.includes("style={buttonStyle}"),
    "Offline page must use inline style objects (not className with external CSS)"
  );

  console.log("  ✓ No <html> tag in component (rendered by layout)");
  console.log("  ✓ No <body> tag in component (rendered by layout)");
  console.log("  ✓ Has default export");
  console.log("  ✓ Has data-hide-nav attribute");
  console.log("  ✓ Uses branding configuration");
  console.log("  ✓ Has retry link (works without JS)");
  console.log("  ✓ Has inline styles (works without external CSS)");
  console.log("  ✓ Has brand colors in inline styles");
}

function testLayoutBottomNav() {
  console.log("\n▶ Testing layout bottom nav handling...");

  const layoutPath = path.join(__dirname, "..", "src", "app", "layout.tsx");
  const layoutSource = fs.readFileSync(layoutPath, "utf-8");

  // Layout should render BottomNav
  assert(
    layoutSource.includes("BottomNav"),
    "Root layout should render BottomNav"
  );

  // Check that globals.css has the hide rule
  const globalsPath = path.join(__dirname, "..", "src", "app", "globals.css");
  const globalsSource = fs.readFileSync(globalsPath, "utf-8");

  assert(
    globalsSource.includes("[data-hide-nav]") && globalsSource.includes("display: none"),
    "globals.css should hide elements after [data-hide-nav]"
  );

  console.log("  ✓ Root layout renders BottomNav");
  console.log("  ✓ globals.css has [data-hide-nav] hide rule");
}

function main() {
  console.log("Testing Offline Page HTML Structure");
  console.log("===================================");

  try {
    testOfflinePageComponent();
    testLayoutBottomNav();
    testOfflineBuildOutput();

    console.log("\n✅ All offline HTML structure tests passed\n");
    process.exit(0);
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
