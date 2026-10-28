/**
 * L2 Behavioral test for join code redemption and confirmation UI
 * 
 * Tests:
 * - JoinConfirmation component rendering (role copy, button states)
 * - redeemJoinCode action with stubbed/mocked client (pending, success, errors)
 * 
 * Run: REAL_DB=1 npx tsx scripts/test-gym-join-code-actions-behavioral.ts
 */

import "./helpers/setup-jsdom";
import { installServerActionStubs, stubState } from "./helpers/server-action-stubs";
import { createFakeDb, json } from "./helpers/fake-postgrest";
import { strict as assert } from "node:assert";

console.log("=== L2 Behavioral: Join Code Redemption & UI ===\n");

// Install stubs BEFORE importing the action module
installServerActionStubs();

async function main() {
  const React = await import("react");
  const { render, cleanup } = await import("@testing-library/react");
  const { fireEvent, waitFor } = await import("@testing-library/react");
  const { mockNextRouter } = await import("./helpers/setup-jsdom");

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

  // Test 2: Button states and async behavior with mocked RPC
  console.log("TEST 2: Button states during redemption (pending, error, success)");
  {
    const { JoinConfirmation } = await import("@/app/join/[code]/join-confirmation");
    const db = createFakeDb();
    
    // Case A: Expired code
    {
      db.beforeRequest = (req) => {
        if (req.table === "rpc/redeem_join_code") {
          return json(200, { ok: false, reason: "expired" });
        }
      };
      stubState.client = db.client;
      stubState.userId = "test-user-1";

      const { getByRole } = render(
        React.createElement(JoinConfirmation, {
          code: "EXPIREDCODE",
          gymName: "Test Gym",
          role: "member" as const,
          currentGymName: null,
          currentGymRole: undefined,
          codeGymRole: undefined,
          otherMemberGymName: null,
        })
      );

      const confirmButton = getByRole("button", { name: "Confirm" });
      assert.ok(confirmButton instanceof HTMLButtonElement, "FAIL: Button should be HTMLButtonElement");
      assert.ok(!confirmButton.disabled, "FAIL: Button should be enabled initially");

      // Click and wait for async handling
      fireEvent.click(confirmButton);

      await waitFor(() => {
        const errorText = confirmButton.closest("div")?.textContent ?? "";
        assert.match(errorText, /expired|no longer valid/i, "FAIL: Should show expired error message");
      }, { timeout: 2000 });

      cleanup();
    }

    // Case B: RPC error (GJC00)
    {
      db.beforeRequest = (req) => {
        if (req.table === "rpc/redeem_join_code") {
          return json(400, { code: "GJC00", message: "Not authenticated", details: null, hint: null });
        }
      };

      const { getByRole } = render(
        React.createElement(JoinConfirmation, {
          code: "ERRORCODE",
          gymName: "Test Gym",
          role: "member" as const,
          currentGymName: null,
          currentGymRole: undefined,
          codeGymRole: undefined,
          otherMemberGymName: null,
        })
      );

      const confirmButton = getByRole("button", { name: "Confirm" });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        const errorText = confirmButton.closest("div")?.textContent ?? "";
        assert.match(errorText, /signed in|auth/i, "FAIL: Should show auth error message");
      }, { timeout: 2000 });

      cleanup();
    }

    // Case C: Success (redirects to /today)
    {
      db.beforeRequest = (req) => {
        if (req.table === "rpc/redeem_join_code") {
          return json(200, { ok: true, gym_id: "gym-123", gym_name: "Test Gym" });
        }
      };

      let pushCalled = false;
      const originalPush = mockNextRouter.push;
      mockNextRouter.push = (path: string) => {
        if (path === "/today") {
          pushCalled = true;
        }
        originalPush.call(mockNextRouter, path);
      };

      const { getByRole } = render(
        React.createElement(JoinConfirmation, {
          code: "SUCCESSCODE",
          gymName: "Test Gym",
          role: "member" as const,
          currentGymName: null,
          currentGymRole: undefined,
          codeGymRole: undefined,
          otherMemberGymName: null,
        })
      );

      const confirmButton = getByRole("button", { name: "Confirm" });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        assert.ok(pushCalled, "FAIL: Should call router.push('/today') on success");
      }, { timeout: 2000 });

      mockNextRouter.push = originalPush;
      cleanup();
    }

    console.log("  ✓ Button state handling correct\n");
  }

  // Test 3: redeemJoinCode action implementation checks
  console.log("TEST 3: redeemJoinCode action structure and RPC mapping");
  {
    const db = createFakeDb();
    stubState.client = db.client;
    stubState.userId = "test-user-2";

    const { redeemJoinCode } = await import("@/app/join/[code]/actions");

    // Case A: Not signed in (when stubState.userId would be null - but Module stub doesn't support dynamic behavior yet)
    // Documented gap: Module stub returns fixed userId, can't test null case

    // Case B: RPC error mapped by mapDbErrorToMessage
    db.beforeRequest = (req) => {
      if (req.table === "rpc/redeem_join_code") {
        return json(400, { code: "GJC11", message: "Read-only mode", details: null, hint: null });
      }
    };

    const errorResult = await redeemJoinCode({ code: "TESTCODE" });
    assert.ok(!errorResult.ok, "FAIL: Should return !ok for RPC error");
    assert.match(errorResult.error ?? "", /read.?only|maintenance/i, "FAIL: Should map GJC11 to read-only message");

    // Case C: already_member with gym_name
    db.beforeRequest = (req) => {
      if (req.table === "rpc/redeem_join_code") {
        return json(200, { ok: false, reason: "already_member", gym_name: "Test Gym" });
      }
    };

    const alreadyResult = await redeemJoinCode({ code: "TESTCODE" });
    assert.ok(!alreadyResult.ok, "FAIL: Should return !ok for already_member");
    assert.match(alreadyResult.error ?? "", /Test Gym/, "FAIL: Should include gym_name in already_member message");

    // Case D: Success
    db.beforeRequest = (req) => {
      if (req.table === "rpc/redeem_join_code") {
        return json(200, { ok: true, gym_id: "gym-456", gym_name: "Success Gym" });
      }
    };

    const successResult = await redeemJoinCode({ code: "SUCCESSCODE" });
    assert.ok(successResult.ok, "FAIL: Should return ok=true for success");

    console.log("  ✓ redeemJoinCode correctly structured\n");
  }

  console.log("✅ All L2 behavioral tests passed");
}

main().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
