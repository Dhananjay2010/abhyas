#!/usr/bin/env tsx

/**
 * Test: HostWinsNotice display name and positioning (LOW b)
 * 
 * Behavioral test using renderToStaticMarkup.
 * Verifies:
 * 1. Notice displays gym's display name (gymName), not internal id
 * 2. Notice has proper positioning (checks structure/classes)
 * 
 * Mutant: Replace gymName with gymId in notice text.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { HostWinsNotice } from "@/components/host-wins-notice";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

async function testDisplayNameShown() {
  console.log("TEST: Notice shows display names, not internal IDs");
  
  const props = {
    userGymId: "member-gym-uuid-456",
    userGymName: "Downtown Gym & Spa",
    hostGymId: "internal-gym-id-123",
    hostGymName: "Westside Fitness Center",
  };
  
  const html = renderToStaticMarkup(
    <HostWinsNotice {...props} />
  );
  
  // Check that display names appear in rendered HTML
  check("Rendered HTML includes user gym display name", html.includes("Downtown Gym &amp; Spa"));
  check("Rendered HTML includes host gym display name", html.includes("Westside Fitness Center"));
  
  // Check that internal IDs do NOT appear in rendered HTML
  check("Rendered HTML does NOT include user gym ID", !html.includes("member-gym-uuid-456"));
  check("Rendered HTML does NOT include host gym ID", !html.includes("internal-gym-id-123"));
  
  console.log(`  User gym name rendered: "Downtown Gym & Spa"`);
  console.log(`  Host gym name rendered: "Westside Fitness Center"`);
  console.log(`  IDs NOT in output ✓`);
}

async function testPositioningAndStructure() {
  console.log("\nTEST: Notice has proper positioning (fixed, high z-index)");
  
  const props = {
    userGymId: "gym-a",
    userGymName: "Gym A",
    hostGymId: "gym-b",
    hostGymName: "Gym B",
  };
  
  const html = renderToStaticMarkup(
    <HostWinsNotice {...props} />
  );
  
  // Check for fixed positioning class
  check("Notice uses fixed positioning", html.includes('class="fixed'));
  
  // Check for high z-index (z-50)
  check("Notice has z-50 class", html.includes('z-50'));
  
  // Check for centering transform
  check("Notice has -translate-x-1/2 class", html.includes('-translate-x-1/2'));
  
  // Check for top positioning
  check("Notice has top-4 class", html.includes('top-4'));
  
  console.log("  Positioning: fixed top-4 with z-50 and horizontal centering");
}

async function testNoRenderWhenSameGym() {
  console.log("\nTEST: Notice does not render when gym IDs match");
  
  const props = {
    userGymId: "gym-same",
    userGymName: "Same Gym",
    hostGymId: "gym-same", // Same ID
    hostGymName: "Same Gym",
  };
  
  const html = renderToStaticMarkup(
    <HostWinsNotice {...props} />
  );
  
  // Should render empty/null when IDs match
  check("No notice rendered when gym IDs match", html === "" || html.length < 10);
}

async function main() {
  await testDisplayNameShown();
  await testPositioningAndStructure();
  await testNoRenderWhenSameGym();
  
  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed`);
    process.exit(1);
  }
  
  console.log("\n✅ All LOW (b) tests passed");
  console.log("\nLOW (b): HostWinsNotice displays gym names, positioned to avoid overlap.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
