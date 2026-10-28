/**
 * Test: MUTANT M10 - Metadata uses runtime brand name
 * 
 * Tests buildMetadata pure function with host gym brand.
 * Mutant: Use static branding instead of runtime brand parameter.
 */

import { buildMetadata } from "../src/lib/metadata-builder";
import { branding } from "../src/lib/branding";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

async function main() {
  console.log("TEST: MUTANT M10 - Metadata uses runtime brand (not static)");
  {
    // Create a host gym brand (different from base "Abhyas")
    const hostBrand = {
      ...branding,
      name: "Iron Temple",
      shortName: "Iron Temple",
    };
    
    const metadata = buildMetadata(hostBrand);
    
    check("M10: Title is host gym name", metadata.title === "Iron Temple");
    check("M10: Title is NOT base brand", metadata.title !== "Abhyas");
    check("M10: applicationName is host gym", metadata.applicationName === "Iron Temple");
    check("M10: applicationName is NOT base", metadata.applicationName !== "Abhyas");
    
    const og = metadata.openGraph as { siteName?: string; title?: string };
    check("M10: openGraph.siteName is host gym", og.siteName === "Iron Temple");
    check("M10: openGraph.title is host gym", og.title === "Iron Temple");
    
    const apple = metadata.appleWebApp as { title?: string };
    check("M10: appleWebApp.title is host gym", apple.title === "Iron Temple");
  }
  console.log();

  if (failures > 0) {
    console.error(`\n❌ ${failures} test(s) failed`);
    process.exit(1);
  } else {
    console.log("✅ All tests passed");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
