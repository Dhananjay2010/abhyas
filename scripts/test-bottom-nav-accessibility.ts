/**
 * Test that the bottom nav has non-color accessibility cues for the active tab:
 * - font-semibold on the active label
 * - a 2px accent indicator bar at the top of the active item
 * - aria-current="page" preserved
 */

import { readFileSync } from "fs";
import { join } from "path";

let failures = 0;

function checkBottomNavAccessibility(): void {
  try {
    const filePath = join(process.cwd(), "src/components/bottom-nav.tsx");
    const content = readFileSync(filePath, "utf-8");

    // Check for aria-current preservation
    const hasAriaCurrent = content.includes('aria-current={isActive ? "page" : undefined}');
    if (!hasAriaCurrent) {
      console.error("❌ aria-current should be preserved on the Link");
      failures++;
    } else {
      console.log("✓ aria-current is preserved");
    }

    // Check for font-semibold on active label
    const hasFontSemibold = content.match(
      /className=\{`text-\[11px\] leading-none \${isActive \? "font-semibold" : "font-medium"}`\}/
    );
    if (!hasFontSemibold) {
      console.error("❌ Active label should have font-semibold, inactive should have font-medium");
      failures++;
    } else {
      console.log("✓ Active label uses font-semibold, inactive uses font-medium");
    }

    // Check for accent indicator bar at top
    const hasIndicatorBar = content.includes("aria-hidden=\"true\"") &&
                            content.includes("top-0") &&
                            content.includes("h-0.5") &&
                            content.includes("bg-accent") &&
                            content.includes("{isActive &&");
    if (!hasIndicatorBar) {
      console.error("❌ Active tab should have a 2px (h-0.5) accent indicator bar at top");
      failures++;
    } else {
      console.log("✓ Active tab has accent indicator bar at top (aria-hidden)");
    }

    // Check that the Link has relative positioning for the absolute indicator
    const hasRelativePositioning = content.includes('className={`relative flex flex-col');
    if (!hasRelativePositioning) {
      console.error("❌ Link should have relative positioning for the indicator bar");
      failures++;
    } else {
      console.log("✓ Link has relative positioning");
    }

  } catch (error) {
    console.error(`❌ Could not read bottom-nav.tsx: ${error}`);
    failures++;
  }
}

console.log("Testing bottom nav accessibility indicators...\n");
checkBottomNavAccessibility();

console.log(
  `\n${failures === 0 ? "✓" : "✗"} ${failures === 0 ? "All checks passed" : `${failures} check(s) failed`}`
);
process.exit(failures === 0 ? 0 : 1);
