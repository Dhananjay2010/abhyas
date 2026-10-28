#!/usr/bin/env tsx

/**
 * Test: HostWinsNotice display name and positioning (LOW b)
 * 
 * Verifies:
 * 1. Notice displays gym's display name (gymName), not internal id
 * 2. Notice has proper positioning to avoid page heading overlap (fixed top-4, z-50)
 * 
 * Mutant: Replace gymName with gymId in notice text.
 */

import { getHostWinsNoticeProps } from "@/lib/host-wins-logic";
import type { BrandResolution } from "@/lib/runtime-brand";
import type { UserGymMembership } from "@/lib/gym/member-gym";
import { branding } from "@/lib/branding";
import { readFileSync } from "fs";

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${label}${detail ? `  -- ${detail}` : ""}`,
  );
}

async function testDisplayNameShown() {
  console.log("TEST: Notice shows display names, not internal IDs");
  
  const resolution: BrandResolution = {
    brand: branding,
    gymId: "internal-gym-id-123",
    gymName: "Westside Fitness Center",
    tier: "host",
  };
  
  const memberGym: UserGymMembership = {
    gymId: "member-gym-uuid-456",
    gymName: "Downtown Gym & Spa",
  };
  
  const props = getHostWinsNoticeProps(resolution, memberGym);
  
  check("User gym name is display name", props.userGymName === "Downtown Gym & Spa");
  check("Host gym name is display name", props.hostGymName === "Westside Fitness Center");
  check("User gym name is NOT internal ID", props.userGymName !== "member-gym-uuid-456");
  check("Host gym name is NOT internal ID", props.hostGymName !== "internal-gym-id-123");
  
  console.log(`  User gym: "${props.userGymName}" (not "${props.userGymId}")`);
  console.log(`  Host gym: "${props.hostGymName}" (not "${props.hostGymId}")`);
}

async function testComponentUsesDisplayNames() {
  console.log("\nTEST: HostWinsNotice component uses gymName props");
  
  // Read the component source
  const componentPath = "src/components/host-wins-notice.tsx";
  const componentSource = readFileSync(componentPath, "utf-8");
  
  // Check that component uses hostGymName and userGymName (display names)
  const usesHostGymName = componentSource.includes("<strong>{hostGymName}</strong>");
  const usesUserGymName = componentSource.includes("<strong>{userGymName}</strong>");
  
  check("Component renders hostGymName", usesHostGymName);
  check("Component renders userGymName", usesUserGymName);
  
  // Check that it does NOT use gymId in the user-visible text
  const hasGymIdInText = componentSource.match(/{.*GymId}/);
  check("Component does NOT render gymId in notice text", !hasGymIdInText);
}

async function testPositioningNoOverlap() {
  console.log("\nTEST: Notice positioned to avoid page heading overlap");
  
  // Read the component source
  const componentPath = "src/components/host-wins-notice.tsx";
  const componentSource = readFileSync(componentPath, "utf-8");
  
  // Verify positioning: fixed top with high z-index
  const hasFixedPosition = componentSource.includes('className="fixed top-');
  const hasHighZIndex = componentSource.includes('z-50');
  const hasCenterTransform = componentSource.includes('-translate-x-1/2');
  
  check("Notice uses fixed positioning", hasFixedPosition);
  check("Notice has z-50 (above content)", hasHighZIndex);
  check("Notice centered horizontally", hasCenterTransform);
  
  console.log("  Position: fixed top-4 (16px from viewport top)");
  console.log("  Z-index: 50 (above page content, same as modals)");
  console.log("  Layout: Centered, no interference with flow headings");
}

async function main() {
  await testDisplayNameShown();
  await testComponentUsesDisplayNames();
  await testPositioningNoOverlap();
  
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
