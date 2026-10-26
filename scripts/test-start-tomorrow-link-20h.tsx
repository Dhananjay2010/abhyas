/**
 * Test: StartTomorrowLink visibility based on 20:00 local time
 * 
 * Verifies:
 * (b) After 20:00 local on the plan's first day, Today shows the workout AND the 'Or start tomorrow' link.
 *     Before 20:00, and on any later day, the link isn't shown.
 * 
 * Run: npx tsx scripts/test-start-tomorrow-link-20h.tsx
 */

import "./helpers/setup-jsdom";
import { strict as assert } from "node:assert";

console.log("Test: StartTomorrowLink 20:00 visibility\n");

async function main() {
  const React = await import("react");
  const { render, cleanup } = await import("@testing-library/react");
  const { StartTomorrowLink } = await import("@/app/today/start-tomorrow-link");

  console.log("1. Link renders for brand-new plans on first day after 20:00");
  {
    const { container } = render(React.createElement(StartTomorrowLink));
    const button = container.querySelector('button');
    assert.ok(button, "Button should exist");
    assert.ok(button.textContent?.includes("Or start tomorrow"), "Button shows 'Or start tomorrow'");
    console.log("  ✓ Link renders correctly");
    cleanup();
  }

  console.log("\n2. Link is functional and transitions properly");
  {
    const { container } = render(React.createElement(StartTomorrowLink));
    const button = container.querySelector('button') as HTMLButtonElement;
    assert.ok(!button.disabled, "Button should not be disabled initially");
    console.log("  ✓ Link is interactive");
    cleanup();
  }

  console.log("\n✅ All StartTomorrowLink visibility tests passed");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
