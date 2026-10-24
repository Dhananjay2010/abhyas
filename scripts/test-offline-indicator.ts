#!/usr/bin/env tsx
/**
 * Test: offline indicator with renderToStaticMarkup
 *
 * Verifies that the isOffline helper can be tested with React's renderToStaticMarkup.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isOffline } from "../src/lib/session/is-offline";

// Mock navigator for SSR testing
const originalNavigator = global.navigator;

function OfflineIndicator() {
  if (isOffline()) {
    return React.createElement("div", { className: "offline-banner" }, "Offline — sets will save when you're back");
  }
  return null;
}

async function main() {
  console.log("Testing offline indicator with renderToStaticMarkup...\n");

  // Test 1: SSR (no navigator) - should render nothing
  delete (global as { navigator?: unknown }).navigator;

  if (isOffline()) {
    throw new Error("isOffline should return false during SSR (no navigator)");
  }

  const ssrHtml = renderToStaticMarkup(React.createElement(OfflineIndicator));
  if (ssrHtml !== "") {
    throw new Error(`SSR should render nothing, got: ${ssrHtml}`);
  }

  console.log("✓ SSR (no navigator): renders nothing");

  // Test 2: Client-side online
  (global as { navigator: { onLine: boolean } }).navigator = { onLine: true };

  if (isOffline()) {
    throw new Error("isOffline should return false when navigator.onLine is true");
  }

  const onlineHtml = renderToStaticMarkup(React.createElement(OfflineIndicator));
  if (onlineHtml !== "") {
    throw new Error(`Online should render nothing, got: ${onlineHtml}`);
  }

  console.log("✓ Client-side online: renders nothing");

  // Test 3: Client-side offline
  (global as { navigator: { onLine: boolean } }).navigator = { onLine: false };

  if (!isOffline()) {
    throw new Error("isOffline should return true when navigator.onLine is false");
  }

  const offlineHtml = renderToStaticMarkup(React.createElement(OfflineIndicator));
  // React escapes apostrophes as &#x27; in HTML
  if (!offlineHtml.includes("Offline") || !offlineHtml.includes("sets will save when you")) {
    throw new Error(`Offline should render banner, got: ${offlineHtml}`);
  }
  if (!offlineHtml.includes('class="offline-banner"')) {
    throw new Error(`Offline banner should have correct class`);
  }

  console.log("✓ Client-side offline: renders banner");

  // Restore original navigator
  if (originalNavigator !== undefined) {
    (global as { navigator: unknown }).navigator = originalNavigator;
  }

  console.log("\n✓ All offline indicator tests passed");
}

main().catch((err) => {
  console.error("✗ Test failed:", err);
  // Restore navigator before exiting
  if (originalNavigator !== undefined) {
    (global as { navigator: unknown }).navigator = originalNavigator;
  }
  process.exit(1);
});
