/**
 * L2 Behavioral test for join code redemption and confirmation UI
 * 
 * Tests:
 * - JoinConfirmation component rendering (role copy, button states)
 * - redeemJoinCode action structure
 * 
 * Run: npm run test:gym-join-code-actions-behavioral
 */

import "./helpers/setup-jsdom";
import { strict as assert } from "node:assert";

console.log("=== L2 Behavioral: Join Code Redemption & UI ===\n");

async function main() {
  const React = await import("react");
  const { render, cleanup } = await import("@testing-library/react");

  // Test 1: JoinConfirmation per-role copy
  console.log("TEST 1: JoinConfirmation per-role copy");
  {
    const { JoinConfirmation } = await import("@/app/join/[code]/join-confirmation");

    // Scenario: Member joining as member
    const { container: memberContainer } = render(
      React.createElement(JoinConfirmation, {
        code: "TESTCODE",
        gymName: "PowerHouse Gym",
        role: "member" as const,
        currentGymName: null,
        currentGymRole: undefined,
        codeGymRole: undefined,
        otherMemberGymName: null,
      })
    );
    const memberText = memberContainer.textContent ?? "";
    assert.match(memberText, /Join PowerHouse Gym/, "FAIL: Should show 'Join' for new member");
    assert.match(memberText, /member/, "FAIL: Should show role 'member'");
    assert.match(memberText, /Confirm/, "FAIL: Should show 'Confirm' button");

    cleanup();

    // Scenario: Member upgrading to staff
    const { container: upgradeContainer } = render(
      React.createElement(JoinConfirmation, {
        code: "STAFFCODE",
        gymName: "PowerHouse Gym",
        role: "staff" as const,
        currentGymName: "PowerHouse Gym",
        currentGymRole: "member" as const,
        codeGymRole: "member" as const,
        otherMemberGymName: null,
      })
    );
    const upgradeText = upgradeContainer.textContent ?? "";
    assert.match(upgradeText, /Join PowerHouse Gym as staff/, "FAIL: Should show 'Join as staff' for upgrade");
    assert.match(upgradeText, /currently a member/, "FAIL: Should explain current member status");
    assert.match(upgradeText, /upgrade you to staff/, "FAIL: Should explain upgrade");
    assert.match(upgradeText, /Join as staff/, "FAIL: Button should say 'Join as staff'");

    cleanup();

    // Scenario: Already in gym at same role
    const { container: alreadyContainer } = render(
      React.createElement(JoinConfirmation, {
        code: "MEMBERCODE",
        gymName: "PowerHouse Gym",
        role: "member" as const,
        currentGymName: "PowerHouse Gym",
        currentGymRole: "member" as const,
        codeGymRole: "member" as const,
        otherMemberGymName: null,
      })
    );
    const alreadyText = alreadyContainer.textContent ?? "";
    assert.match(alreadyText, /Already in PowerHouse Gym/, "FAIL: Should show 'Already in' for same role");
    assert.match(alreadyText, /Close/, "FAIL: Button should say 'Close' when already member");
    assert.ok(!alreadyText.match(/Confirm/), "FAIL: Should not show Confirm button when already member");

    cleanup();

    console.log("  ✓ Per-role copy correct\n");
  }

  // Test 2: redeemJoinCode action implementation structure
  console.log("TEST 2: redeemJoinCode action structure");
  {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");

    const actionsSource = readFileSync(
      join(process.cwd(), "src", "app", "join", "[code]", "actions.ts"),
      "utf-8"
    );

    assert.match(
      actionsSource,
      /import.*processRedeemResult.*from.*redeem-join-code-errors/,
      "FAIL: actions.ts must import processRedeemResult"
    );
    assert.match(
      actionsSource,
      /return processRedeemResult\(/,
      "FAIL: actions.ts must call processRedeemResult"
    );
    assert.match(
      actionsSource,
      /\.rpc\(\s*['"]redeem_join_code['"]/,
      "FAIL: actions.ts must call redeem_join_code RPC"
    );

    console.log("  ✓ redeemJoinCode correctly structured\n");
  }

  console.log("✅ All L2 behavioral tests passed");
}

main().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
