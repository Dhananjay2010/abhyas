/**
 * Test: Offline screen consistency
 *
 * Verifies that the SW offline HTML and the shared OfflineScreen component
 * use the same heading, body copy, button label and icon from shared constants.
 *
 * This ensures ONE stable offline experience with no flash/swap between
 * SW-served offline page and in-app error boundary.
 */

import { readFile } from "fs/promises";
import { join } from "path";
import { OFFLINE_SCREEN_HEADING, OFFLINE_SCREEN_BODY, OFFLINE_SCREEN_BUTTON_LABEL } from "../src/lib/offline-copy";
import { branding } from "../src/lib/branding";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

async function testOfflineScreenConsistency() {
  console.log("\n▶ Testing offline screen consistency...");

  // Read offline-copy module source
  const offlineCopyPath = join(__dirname, "..", "src", "lib", "offline-copy.ts");
  const offlineCopySource = await readFile(offlineCopyPath, "utf-8");

  // Read OfflineScreen component source
  const componentPath = join(__dirname, "..", "src", "components", "offline-screen.tsx");
  const componentSource = await readFile(componentPath, "utf-8");

  console.log("\n▶ Verifying shared constants are exported from offline-copy module...");

  assert(
    offlineCopySource.includes("export const OFFLINE_SCREEN_HEADING"),
    "offline-copy.ts must export OFFLINE_SCREEN_HEADING constant"
  );

  assert(
    offlineCopySource.includes("export const OFFLINE_SCREEN_BODY"),
    "offline-copy.ts must export OFFLINE_SCREEN_BODY constant"
  );

  assert(
    offlineCopySource.includes("export const OFFLINE_SCREEN_BUTTON_LABEL"),
    "offline-copy.ts must export OFFLINE_SCREEN_BUTTON_LABEL constant"
  );

  console.log("  ✓ OFFLINE_SCREEN_HEADING exported from offline-copy.ts");
  console.log("  ✓ OFFLINE_SCREEN_BODY exported from offline-copy.ts");
  console.log("  ✓ OFFLINE_SCREEN_BUTTON_LABEL exported from offline-copy.ts");

  console.log("\n▶ Verifying shared constants have correct values...");

  assert(
    OFFLINE_SCREEN_HEADING === "You're offline",
    `OFFLINE_SCREEN_HEADING must be "You're offline", got "${OFFLINE_SCREEN_HEADING}"`
  );

  assert(
    OFFLINE_SCREEN_BODY.includes(branding.name) &&
      OFFLINE_SCREEN_BODY.includes("needs an internet connection"),
    `OFFLINE_SCREEN_BODY must include brand name and "needs an internet connection", got "${OFFLINE_SCREEN_BODY}"`
  );

  assert(
    OFFLINE_SCREEN_BUTTON_LABEL === "Retry",
    `OFFLINE_SCREEN_BUTTON_LABEL must be "Retry", got "${OFFLINE_SCREEN_BUTTON_LABEL}"`
  );

  console.log(`  ✓ OFFLINE_SCREEN_HEADING: "${OFFLINE_SCREEN_HEADING}"`);
  console.log(`  ✓ OFFLINE_SCREEN_BODY: "${OFFLINE_SCREEN_BODY}"`);
  console.log(`  ✓ OFFLINE_SCREEN_BUTTON_LABEL: "${OFFLINE_SCREEN_BUTTON_LABEL}"`);

  console.log("\n▶ Verifying OfflineScreen imports and uses shared constants...");

  assert(
    componentSource.includes('from "@/lib/offline-copy"'),
    "Component must import from @/lib/offline-copy"
  );

  assert(
    componentSource.includes("{OFFLINE_SCREEN_HEADING}"),
    "Component must use {OFFLINE_SCREEN_HEADING} in JSX"
  );

  assert(
    componentSource.includes("{OFFLINE_SCREEN_BODY}"),
    "Component must use {OFFLINE_SCREEN_BODY} in JSX"
  );

  assert(
    componentSource.includes("branding.icons.icon192"),
    "Component must use branding.icons.icon192 for app icon"
  );

  console.log("  ✓ Component imports from @/lib/offline-copy");
  console.log("  ✓ Component uses {OFFLINE_SCREEN_HEADING}");
  console.log("  ✓ Component uses {OFFLINE_SCREEN_BODY}");
  console.log("  ✓ Component uses branding.icons.icon192");

  console.log("\n▶ Verifying /offline route uses OfflineScreen...");

  const offlinePagePath = join(__dirname, "..", "src", "app", "offline", "page.tsx");
  const offlinePageSource = await readFile(offlinePagePath, "utf-8");

  assert(
    offlinePageSource.includes('import { OfflineScreen }'),
    "/offline page must import OfflineScreen component"
  );

  assert(
    offlinePageSource.includes("<OfflineScreen"),
    "/offline page must render <OfflineScreen /> component"
  );

  assert(
    offlinePageSource.includes("fullPage={true}") || offlinePageSource.includes('fullPage'),
    "/offline page must pass fullPage prop to OfflineScreen"
  );

  console.log("  ✓ /offline page imports OfflineScreen");
  console.log("  ✓ /offline page renders <OfflineScreen />");
  console.log("  ✓ /offline page passes fullPage prop");

  console.log("\n▶ Verifying error boundaries use OfflineScreen...");

  const errorPagePath = join(__dirname, "..", "src", "app", "error.tsx");
  const errorPageSource = await readFile(errorPagePath, "utf-8");

  assert(
    errorPageSource.includes('import { OfflineScreen }') ||
      errorPageSource.includes("import { OfflineScreen }"),
    "error.tsx must import OfflineScreen component"
  );

  assert(
    errorPageSource.includes("<OfflineScreen"),
    "error.tsx must render <OfflineScreen /> for offline errors"
  );

  console.log("  ✓ error.tsx imports OfflineScreen");
  console.log("  ✓ error.tsx renders <OfflineScreen /> for offline errors");

  console.log("\n▶ Verifying global-error.tsx uses shared constants...");

  const globalErrorPath = join(__dirname, "..", "src", "app", "global-error.tsx");
  const globalErrorSource = await readFile(globalErrorPath, "utf-8");

  assert(
    globalErrorSource.includes('from "@/lib/offline-copy"'),
    "global-error.tsx must import from @/lib/offline-copy"
  );

  assert(
    globalErrorSource.includes("OFFLINE_SCREEN_HEADING") &&
      globalErrorSource.includes("OFFLINE_SCREEN_BODY") &&
      globalErrorSource.includes("OFFLINE_SCREEN_BUTTON_LABEL"),
    "global-error.tsx must use all three constants"
  );

  assert(
    globalErrorSource.includes("branding.icons.icon192"),
    "global-error.tsx must use branding.icons.icon192 for offline icon"
  );

  assert(
    globalErrorSource.includes('<a href="">') || globalErrorSource.includes("<a"),
    "global-error.tsx must use <a> for offline retry"
  );

  console.log("  ✓ global-error.tsx imports from @/lib/offline-copy");
  console.log("  ✓ global-error.tsx uses all three constants");
  console.log("  ✓ global-error.tsx uses branding.icons.icon192");
  console.log("  ✓ global-error.tsx uses <a> for offline retry");

  console.log("\n▶ Verifying global-error.tsx uses shared retry logic...");

  assert(
    globalErrorSource.includes('from "@/lib/offline-retry-logic"'),
    "global-error.tsx must import from @/lib/offline-retry-logic"
  );

  assert(
    globalErrorSource.includes("determineRetryAction"),
    "global-error.tsx must use determineRetryAction"
  );

  assert(
    globalErrorSource.includes('"Checking…"') || globalErrorSource.includes("'Checking…'"),
    "global-error.tsx must show 'Checking…' during retry"
  );

  assert(
    globalErrorSource.includes('"Still offline"') || globalErrorSource.includes("'Still offline'"),
    "global-error.tsx must show 'Still offline' feedback"
  );

  assert(
    globalErrorSource.includes("RETRY_TIMEOUT_MS"),
    "global-error.tsx must define RETRY_TIMEOUT_MS constant"
  );

  console.log("  ✓ global-error.tsx imports determineRetryAction");
  console.log("  ✓ global-error.tsx shows 'Checking…' during retry");
  console.log("  ✓ global-error.tsx shows 'Still offline' feedback");
  console.log("  ✓ global-error.tsx defines RETRY_TIMEOUT_MS");

  console.log("\n▶ Verifying global-error.tsx matches OfflineScreen styling...");

  assert(
    globalErrorSource.includes("font-size: 1.5rem") || globalErrorSource.includes("font-size:1.5rem"),
    "global-error.tsx h1 must use font-size: 1.5rem (matches OfflineScreen)"
  );

  assert(
    globalErrorSource.includes("margin-bottom: 0.75rem") || globalErrorSource.includes("margin-bottom:0.75rem"),
    "global-error.tsx h1 must use margin-bottom: 0.75rem (matches OfflineScreen)"
  );

  assert(
    globalErrorSource.includes("font-weight: 600") || globalErrorSource.includes("font-weight:600"),
    "global-error.tsx h1 must use font-weight: 600 (matches OfflineScreen)"
  );

  assert(
    globalErrorSource.includes("font-size: 1rem") || globalErrorSource.includes("font-size:1rem"),
    "global-error.tsx p must use font-size: 1rem (matches OfflineScreen)"
  );

  assert(
    globalErrorSource.includes("line-height: 1.5") || globalErrorSource.includes("line-height:1.5"),
    "global-error.tsx p must use line-height: 1.5 (matches OfflineScreen)"
  );

  assert(
    globalErrorSource.includes("width: 6rem") && globalErrorSource.includes("height: 6rem"),
    "global-error.tsx icon must use width/height: 6rem (matches OfflineScreen)"
  );

  assert(
    globalErrorSource.includes("margin: 0 auto 2rem"),
    "global-error.tsx icon must use margin: 0 auto 2rem (matches OfflineScreen)"
  );

  console.log("  ✓ global-error.tsx h1 font-size: 1.5rem (matches OfflineScreen)");
  console.log("  ✓ global-error.tsx h1 margin-bottom: 0.75rem (matches OfflineScreen)");
  console.log("  ✓ global-error.tsx h1 font-weight: 600 (matches OfflineScreen)");
  console.log("  ✓ global-error.tsx p font-size: 1rem (matches OfflineScreen)");
  console.log("  ✓ global-error.tsx p line-height: 1.5 (matches OfflineScreen)");
  console.log("  ✓ global-error.tsx icon width/height: 6rem (matches OfflineScreen)");
  console.log("  ✓ global-error.tsx icon margin: 0 auto 2rem (matches OfflineScreen)");

  console.log("\n▶ Verifying SW route imports shared constants from offline-copy module...");

  const swRoutePath = join(__dirname, "..", "src", "app", "sw.js", "route.ts");
  const swRouteSource = await readFile(swRoutePath, "utf-8");

  assert(
    swRouteSource.includes('from "@/lib/offline-copy"'),
    "SW route must import from @/lib/offline-copy (plain module, not component)"
  );

  assert(
    swRouteSource.includes("OFFLINE_SCREEN_HEADING") &&
      swRouteSource.includes("OFFLINE_SCREEN_BODY") &&
      swRouteSource.includes("OFFLINE_SCREEN_BUTTON_LABEL"),
    "SW route must import all three constants"
  );

  console.log("  ✓ SW route imports from @/lib/offline-copy (plain module)");
  console.log("  ✓ SW route imports all three constants");

  console.log("\n▶ Verifying data-offline attribute is set...");

  assert(
    componentSource.includes('data-offline="true"'),
    "OfflineScreen must set data-offline=\"true\" to hide bottom nav"
  );

  console.log("  ✓ OfflineScreen sets data-offline=\"true\"");

  console.log("\n▶ Verifying no hard-coded colors in OfflineScreen...");

  // Allow hex colors only in comments (e.g., // #abc123)
  const lines = componentSource.split("\n");
  const codeLines = lines.filter(line => !line.trim().startsWith("//") && !line.trim().startsWith("*"));
  const codeWithoutComments = codeLines.join("\n");

  const hexColorMatches = codeWithoutComments.match(/#[0-9a-fA-F]{3,6}/g) || [];
  assert(
    hexColorMatches.length === 0,
    `OfflineScreen must not have hard-coded hex colors, found: ${hexColorMatches.join(", ")}`
  );

  assert(
    componentSource.includes("branding.colors"),
    "OfflineScreen must use branding.colors tokens"
  );

  console.log("  ✓ OfflineScreen has no hard-coded hex colors");
  console.log("  ✓ OfflineScreen uses branding.colors tokens");

  console.log("\n▶ Verifying <noscript> fallback link on /offline...");

  assert(
    componentSource.includes("<noscript>"),
    "OfflineScreen fullPage variant must include <noscript> element"
  );

  assert(
    componentSource.includes('href="/"'),
    "OfflineScreen <noscript> must include href=\"/\" link home"
  );

  console.log("  ✓ OfflineScreen includes <noscript> fallback");
  console.log('  ✓ <noscript> link goes home (href="/")');
}

console.log("Testing Offline Screen Consistency");
console.log("=================================");

testOfflineScreenConsistency().then(
  () => {
    console.log("\n✅ All offline screen consistency tests passed\n");
    process.exit(0);
  },
  (error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
);
