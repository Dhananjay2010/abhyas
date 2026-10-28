/**
 * Test: MUTANT M10 - Metadata uses runtime brand name
 * 
 * Tests buildMetadata pure function AND layout wiring with injected resolution.
 * Mutant: Use static branding instead of runtime brand parameter.
 */

import { buildMetadata } from "../src/lib/metadata-builder";
import { generateMetadataFor } from "../src/lib/layout-metadata";
import { branding } from "../src/lib/branding";
import type { Brand, BrandResolution } from "../src/lib/branding";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

async function main() {
  console.log("TEST: MUTANT M10 - Metadata uses runtime brand (not static)");
  
  // Create a host gym brand (different from base "Abhyas")
  const hostBrand: Brand = {
    name: "Iron Temple",
    shortName: "Iron Temple",
    logoUrl: "https://gym.example.com/logo.png",
    logoAlt: "Iron Temple Logo",
    colors: branding.colors,
    siteUrl: branding.siteUrl,
    defaultWelcomeMessage: branding.defaultWelcomeMessage,
    supportEmail: branding.supportEmail,
  };
  
  // Test buildMetadata directly
  {
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
  
  // Test layout wiring with injected resolution
  {
    const stubResolution: BrandResolution = {
      tier: "host",
      brand: hostBrand,
      gymId: "test-gym-id",
    };
    
    const layoutMetadata = await generateMetadataFor(async () => stubResolution);
    
    check("M10: Layout wiring title is runtime brand", layoutMetadata.title === "Iron Temple");
    check("M10: Layout wiring title NOT static", layoutMetadata.title !== "Abhyas");
    check("M10: Layout wiring applicationName is runtime", layoutMetadata.applicationName === "Iron Temple");
    
    const og = layoutMetadata.openGraph as { siteName?: string; title?: string };
    check("M10: Layout wiring openGraph uses runtime", og.siteName === "Iron Temple");
  }
  
  console.log();

  if (failures > 0) {
    console.error(`❌ ${failures} test(s) failed`);
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
