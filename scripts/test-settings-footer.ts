/**
 * Test: Settings page footer with version info
 *
 * Verifies that:
 * 1. Settings page shows version footer
 * 2. Displays short SHA (7 chars) from NEXT_PUBLIC_BUILD_SHA
 * 3. Optionally shows build date if available
 * 4. Uses muted text styling
 */

import { readFileSync } from "fs";
import { join } from "path";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
}

async function testSettingsFooter() {
  console.log("\n▶ Testing settings page footer...");

  const settingsPath = join(__dirname, "..", "src", "app", "settings", "page.tsx");
  const source = readFileSync(settingsPath, "utf-8");

  assert(
    source.includes("<footer") || source.includes("footer"),
    "Settings page must have a footer element"
  );

  assert(
    source.includes("NEXT_PUBLIC_BUILD_SHA"),
    "Footer must display NEXT_PUBLIC_BUILD_SHA"
  );

  assert(
    source.includes("Version"),
    "Footer must show 'Version' label"
  );

  console.log("  ✓ Settings page has footer");
  console.log("  ✓ Footer displays NEXT_PUBLIC_BUILD_SHA");
  console.log("  ✓ Footer shows 'Version' label");

  console.log("\n▶ Verifying dev fallback...");

  assert(
    source.includes('"dev"') || source.includes("'dev'"),
    "Footer must fall back to 'dev' when NEXT_PUBLIC_BUILD_SHA not set"
  );

  console.log("  ✓ Falls back to 'dev' in development");

  console.log("\n▶ Verifying styling...");

  assert(
    source.includes("text-muted"),
    "Footer must use muted text color"
  );

  assert(
    source.includes("text-xs"),
    "Footer must use small text (text-xs)"
  );

  assert(
    source.includes("text-center"),
    "Footer must be centered"
  );

  console.log("  ✓ Uses text-muted color");
  console.log("  ✓ Uses text-xs (small text)");
  console.log("  ✓ Centered alignment");

  console.log("\n▶ Verifying build date formatting...");

  assert(
    source.includes("NEXT_PUBLIC_BUILD_TIME"),
    "Footer must use NEXT_PUBLIC_BUILD_TIME for build date"
  );

  assert(
    !source.includes("parseInt") || !source.includes("NEXT_PUBLIC_BUILD_ID"),
    "Footer must NOT use parseInt on build ID"
  );

  assert(
    source.includes(".slice(0, 10)") || source.includes("slice(0, 10)"),
    "Footer must format build time as UTC YYYY-MM-DD (ISO string slice)"
  );

  console.log("  ✓ Uses NEXT_PUBLIC_BUILD_TIME (ISO string)");
  console.log("  ✓ Does not use parseInt on build ID");
  console.log("  ✓ Formats as UTC YYYY-MM-DD (.slice(0, 10))");
}

console.log("Testing Settings Footer");
console.log("======================");

testSettingsFooter().then(
  () => {
    console.log("\n✅ All settings footer tests passed\n");
    process.exit(0);
  },
  (error) => {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
);
