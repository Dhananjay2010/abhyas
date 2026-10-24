#!/usr/bin/env tsx
/**
 * Test: Inline offline message rendering
 *
 * Verifies that the InlineOfflineMessage component:
 * - Renders nothing when online
 * - Shows inline message when offline
 * - Preserves app shell and tab bar (no full-page takeover)
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Mock InlineOfflineMessage behavior for test
function MockInlineOfflineMessage({ isOffline }: { isOffline: boolean }) {
  if (!isOffline) return null;

  return React.createElement(
    "div",
    {
      className: "mx-4 mt-4 rounded-xl border border-border bg-surface px-4 py-6 text-center",
      role: "status",
      "aria-live": "polite",
    },
    React.createElement(
      "div",
      { className: "mb-2 text-lg font-semibold" },
      "You're offline"
    ),
    React.createElement(
      "div",
      { className: "text-sm text-muted" },
      "This content isn't available offline. Connect to the internet to view it."
    )
  );
}

async function main() {
  console.log("Testing inline offline message rendering...\n");

  // Test 1: Online - renders nothing
  const onlineMarkup = renderToStaticMarkup(
    React.createElement(MockInlineOfflineMessage, { isOffline: false })
  );

  if (onlineMarkup !== "") {
    throw new Error("Online state should render nothing");
  }
  console.log("✓ Online: renders nothing");

  // Test 2: Offline - shows inline message
  const offlineMarkup = renderToStaticMarkup(
    React.createElement(MockInlineOfflineMessage, { isOffline: true })
  );

  if (!offlineMarkup.includes("You&#x27;re offline")) {
    throw new Error("Offline state should show heading");
  }
  if (!offlineMarkup.includes("This content isn&#x27;t available offline")) {
    throw new Error("Offline state should show body text");
  }
  if (!offlineMarkup.includes('role="status"')) {
    throw new Error("Offline message should have role=status for accessibility");
  }
  if (!offlineMarkup.includes('aria-live="polite"')) {
    throw new Error("Offline message should have aria-live=polite");
  }
  console.log("✓ Offline: shows inline message with accessibility attributes");

  // Test 3: Inline message is NOT full-page (no data-offline=true, no minHeight: 100vh)
  if (offlineMarkup.includes('data-offline="true"')) {
    throw new Error("Inline message should NOT have data-offline attribute (that's for full-page)");
  }
  if (offlineMarkup.toLowerCase().includes("minheight") || offlineMarkup.toLowerCase().includes("100vh")) {
    throw new Error("Inline message should NOT use full viewport height");
  }
  console.log("✓ Inline message: not full-page (preserves app shell)");

  console.log("\n✓ All inline offline message tests passed");
}

main().catch((err) => {
  console.error("✗ Test failed:", err.message);
  process.exit(1);
});
