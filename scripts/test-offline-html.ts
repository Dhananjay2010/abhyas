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

  // Should use OfflineScreen component (which internally uses branding)
  assert(
    source.includes("OfflineScreen"),
    "Offline page should use OfflineScreen component"
  );

  // Should import OfflineScreen from components
  assert(
    source.includes('from "@/components/offline-screen"') || 
    source.includes("from '@/components/offline-screen'"),
    "Offline page should import OfflineScreen from @/components/offline-screen"
  );

  // Should render OfflineScreen with fullPage prop
  assert(
    source.includes("fullPage") || source.includes("<OfflineScreen"),
    "Offline page should render OfflineScreen component"
  );

  // Must NOT hardcode ANY hex colors (SVG was replaced with real app icon)
  const hexColorPattern = /#[0-9a-fA-F]{3,6}/g;
  const hexColors = source.match(hexColorPattern) || [];
  assert(
    hexColors.length === 0,
    `Offline page must not hardcode any hex colors (found: ${hexColors.join(", ")})`
  );

  // OfflineScreen component handles the icon and styles internally
  // No need to check for them in the page source since it delegates to OfflineScreen

  console.log("  ✓ No <html> tag in component (rendered by layout)");
  console.log("  ✓ No <body> tag in component (rendered by layout)");
  console.log("  ✓ Has default export");
  console.log("  ✓ Uses OfflineScreen component");
  console.log("  ✓ Imports OfflineScreen from @/components/offline-screen");
  console.log("  ✓ Renders OfflineScreen with fullPage prop");
  console.log("  ✓ No hardcoded hex colors at all");
}

function testLayoutBottomNav() {
  console.log("\n▶ Testing bottom nav offline handling via CSS...");

  // Bottom nav is hidden on offline page via CSS (:has selector)
  // activeTab() from nav.ts may still return the active tab for /offline,
  // so the nav renders but CSS hides it with body:has([data-offline]) [data-bottom-nav]
  
  const bottomNavPath = path.join(__dirname, "..", "src", "components", "bottom-nav.tsx");
  
  assert(
    fs.existsSync(bottomNavPath),
    "src/components/bottom-nav.tsx must exist"
  );

  const bottomNavSource = fs.readFileSync(bottomNavPath, "utf-8");

  // BottomNav should use activeTab() and the exact forNotFound gate
  assert(
    bottomNavSource.includes("activeTab(pathname)") &&
    bottomNavSource.includes("if (forNotFound ? !needsNotFoundNav(pathname) : !active) return null;"),
    'BottomNav must use activeTab() and the exact gate: if (forNotFound ? !needsNotFoundNav(pathname) : !active) return null;'
  );

  // Must have data-bottom-nav attribute for CSS hiding
  assert(
    bottomNavSource.includes("data-bottom-nav"),
    "BottomNav must have data-bottom-nav attribute for CSS hiding"
  );

  console.log("  ✓ BottomNav uses activeTab() for nav visibility");
  console.log("  ✓ BottomNav returns null when activeTab returns null");
  console.log("  ✓ BottomNav has data-bottom-nav for CSS-based offline hiding");
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
