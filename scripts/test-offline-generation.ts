/**
 * Test: Offline page generation from branding
 *
 * Verifies that the generated offline.html uses brand colors, name, and
 * meets WCAG AA contrast requirements.
 */

import * as fs from "fs";
import * as path from "path";
import { branding } from "../src/lib/branding";
import { contrastRatio, accessibleTextColor, meetsWCAG_AA } from "../src/lib/contrast";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

function testOfflinePageExists() {
  console.log("\n▶ Testing offline page generation...");

  const offlinePath = path.join(__dirname, "..", "public", "offline.html");
  
  assert(
    fs.existsSync(offlinePath),
    "offline.html must exist at public/offline.html (run generate-offline-page script)"
  );

  const stats = fs.statSync(offlinePath);
  assert(
    stats.isFile() && stats.size > 0,
    "offline.html must be a non-empty file"
  );

  console.log("  ✓ offline.html exists and is not empty");
}

function testOfflinePageContent() {
  console.log("\n▶ Testing offline page content...");

  const offlinePath = path.join(__dirname, "..", "public", "offline.html");
  const html = fs.readFileSync(offlinePath, "utf-8");

  // Must be valid HTML5 with single <html> element
  assert(
    html.includes("<!DOCTYPE html>"),
    "offline.html must have <!DOCTYPE html>"
  );
  assert(
    html.match(/<html/g)?.length === 1,
    "offline.html must have exactly one <html> tag"
  );
  assert(
    html.match(/<\/html>/g)?.length === 1,
    "offline.html must have exactly one </html> closing tag"
  );

  // Must include brand name
  assert(
    html.includes(branding.name),
    `offline.html must include brand name "${branding.name}"`
  );

  // Must use brand background color
  assert(
    html.includes(branding.backgroundColor),
    `offline.html must use brand background color ${branding.backgroundColor}`
  );

  // Must have a retry link (not button) that works without JS
  assert(
    html.includes('<a href="">'),
    'offline.html must have <a href=""> for retry (works without JS)'
  );

  console.log("  ✓ Valid HTML5 structure (single <html>)");
  console.log(`  ✓ Uses brand name: ${branding.name}`);
  console.log(`  ✓ Uses brand background: ${branding.backgroundColor}`);
  console.log("  ✓ Has retry link without JavaScript");
}

function testOfflinePageContrast() {
  console.log("\n▶ Testing offline page contrast...");

  const offlinePath = path.join(__dirname, "..", "public", "offline.html");
  const html = fs.readFileSync(offlinePath, "utf-8");

  // The accent color for the button is #22c55e (green)
  const accentColor = "#22c55e";
  
  assert(
    html.includes(accentColor),
    `offline.html must use accent color ${accentColor}`
  );

  // Extract the text color from the HTML (should be computed by accessibleTextColor)
  const expectedTextColor = accessibleTextColor(accentColor);
  assert(
    html.includes(`color: ${expectedTextColor}`),
    `offline.html button text should use ${expectedTextColor} (computed from accessibleTextColor)`
  );

  // Verify contrast meets WCAG AA
  const ratio = contrastRatio(expectedTextColor, accentColor);
  assert(
    meetsWCAG_AA(expectedTextColor, accentColor),
    `Button contrast (${expectedTextColor} on ${accentColor}) must meet WCAG AA 4.5:1 (got ${ratio.toFixed(2)}:1)`
  );
  assert(
    ratio >= 4.5,
    `Button contrast must be >= 4.5:1, got ${ratio.toFixed(2)}:1`
  );

  // The button should use dark text (#0a0c0e or #000000) on green background
  const isDarkText = expectedTextColor === "#0a0c0e" || expectedTextColor === "#000000";
  assert(
    isDarkText,
    `Button should use dark text on green background, got ${expectedTextColor}`
  );

  console.log(`  ✓ Uses accent color: ${accentColor}`);
  console.log(`  ✓ Computed text color: ${expectedTextColor}`);
  console.log(`  ✓ Contrast ratio: ${ratio.toFixed(2)}:1 (passes WCAG AA)`);
  console.log("  ✓ Dark text on light green background");
}

function main() {
  console.log("Testing Offline Page Generation");
  console.log("================================");

  try {
    testOfflinePageExists();
    testOfflinePageContent();
    testOfflinePageContrast();

    console.log("\n✅ All offline page generation tests passed\n");
    process.exit(0);
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();
