/**
 * L2 Behavioral test for join code redemption and confirmation UI
 * 
 * Tests:
 * - JoinConfirmation component rendering (role copy, button states)
 * - Async redemption with deferred promises (pending → error → success)
 * - redeemJoinCode action with real RPC calls
 * 
 * Run: npm run test:gym-join-code-actions-behavioral
 */

import "./helpers/setup-jsdom";
import { installServerActionStubs, stubState } from "./helpers/server-action-stubs";
import { createFakeDb, json } from "./helpers/fake-postgrest";
import { strict as assert } from "node:assert";

console.log("=== L2 Behavioral: Join Code Redemption & UI ===\n");

// Install stubs BEFORE importing
installServerActionStubs();
stubState.client = createFakeDb().client;

async function main() {
  const React = await import("react");
  const { render, cleanup, fireEvent, waitFor } = await import("@testing-library/react");
  const { act } = React;
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

  // Test 2: Button states during async redemption (deferred promise)
  console.log("TEST 2: Button states during redemption (pending → error)");
  {
    const db = createFakeDb();
    stubState.client = db.client;
    stubState.userId = "test-user-1";
    
    let resolveRequest: ((value: Response) => void) | null = null;
    const requestPromise = new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
    
    db.beforeRequest = (req) => {
      if (req.table === "rpc/redeem_join_code") {
        return requestPromise as unknown as Response;
      }
    };

    const { JoinConfirmation } = await import("@/app/join/[code]/join-confirmation");

    const { getByRole, container } = render(
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
    assert.ok(confirmButton.tagName === "BUTTON", "FAIL: Element must be a BUTTON");
    
    await act(async () => {
      fireEvent.click(confirmButton);
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // Check button is disabled with "Joining..." while pending
    assert.ok(confirmButton.disabled, "FAIL: Button should be disabled while joining");
    const buttonTextPending = confirmButton.textContent ?? "";
    assert.match(buttonTextPending, /Joining/, "FAIL: Button should show 'Joining...' while pending");

    // Resolve with expired error
    await act(async () => {
      if (resolveRequest) {
        resolveRequest(json(200, { ok: false, reason: "expired" }));
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // Wait for error to show and button to re-enable
    await waitFor(() => {
      const errorText = container.textContent ?? "";
      assert.match(errorText, /expired|no longer valid/i, "FAIL: Should show expired error message");
      assert.ok(!confirmButton.disabled, "FAIL: Button should be re-enabled after error");
      const buttonTextAfter = confirmButton.textContent ?? "";
      assert.match(buttonTextAfter, /Confirm/, "FAIL: Button should say 'Confirm' after error");
    }, { timeout: 2000 });

    cleanup();
    console.log("  ✓ Button state handling correct\n");
  }

  // Test 3: RPC error case (GJC00)
  console.log("TEST 3: RPC error case");
  {
    const db = createFakeDb();
    stubState.client = db.client;
    stubState.userId = "test-user-2";

    db.beforeRequest = (req) => {
      if (req.table === "rpc/redeem_join_code") {
        return json(400, { code: "GJC00", message: "Not authenticated", details: null, hint: null });
      }
    };

    const { JoinConfirmation } = await import("@/app/join/[code]/join-confirmation");

    const { getByRole, container } = render(
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
    
    await act(async () => {
      fireEvent.click(confirmButton);
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    await waitFor(() => {
      const errorText = container.textContent ?? "";
      assert.match(errorText, /signed in|auth/i, "FAIL: Should show auth error message");
    }, { timeout: 2000 });

    cleanup();
    console.log("  ✓ RPC error handling correct\n");
  }

  // Test 4: Success case with router.push
  console.log("TEST 4: Success case redirects to /today");
  {
    const db = createFakeDb();
    stubState.client = db.client;
    stubState.userId = "test-user-3";

    db.beforeRequest = (req) => {
      if (req.table === "rpc/redeem_join_code") {
        return json(200, { ok: true, gym_id: "gym-123", gym_name: "Test Gym" });
      }
    };

    let pushCalled = false;
    let pushArg: unknown = null;
    const originalPush = mockNextRouter.push;
    mockNextRouter.push = ((arg: unknown) => {
      pushArg = arg;
      if (arg === "/today") {
        pushCalled = true;
      }
      const fn = originalPush as unknown as (a: unknown) => void;
      return fn.call(mockNextRouter, arg);
    }) as typeof mockNextRouter.push;

    const { JoinConfirmation } = await import("@/app/join/[code]/join-confirmation");

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
    
    await act(async () => {
      fireEvent.click(confirmButton);
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    await waitFor(() => {
      assert.ok(pushCalled, `FAIL: Should call router.push('/today'), got: ${pushArg}`);
    }, { timeout: 2000 });

    mockNextRouter.push = originalPush;
    cleanup();
    console.log("  ✓ Success redirect correct\n");
  }

  // Test 5: redeemJoinCode action with real calls
  console.log("TEST 5: redeemJoinCode action with stubbed RPC");
  {
    const db = createFakeDb();
    stubState.client = db.client;
    stubState.userId = "test-user-4";

    const { redeemJoinCode } = await import("@/app/join/[code]/actions");

    // Case A: RPC error mapped by mapDbErrorToMessage
    db.beforeRequest = (req) => {
      if (req.table === "rpc/redeem_join_code") {
        return json(400, { code: "GJC11", message: "Read-only mode", details: null, hint: null });
      }
    };

    const errorResult = await redeemJoinCode("TESTCODE");
    assert.ok(!errorResult.ok, "FAIL: Should return !ok for RPC error");
    assert.match(errorResult.error ?? "", /read.?only|maintenance/i, "FAIL: Should map GJC11 to read-only message");

    // Case B: already_member with gym_name
    db.beforeRequest = (req) => {
      if (req.table === "rpc/redeem_join_code") {
        return json(200, { ok: false, reason: "already_member", gym_name: "Test Gym" });
      }
    };

    const alreadyResult = await redeemJoinCode("TESTCODE");
    assert.ok(!alreadyResult.ok, "FAIL: Should return !ok for already_member");
    assert.match(alreadyResult.error ?? "", /Test Gym/, "FAIL: Should include gym_name in already_member message");

    // Case C: Success
    db.beforeRequest = (req) => {
      if (req.table === "rpc/redeem_join_code") {
        return json(200, { ok: true, gym_id: "gym-456", gym_name: "Success Gym" });
      }
    };

    const successResult = await redeemJoinCode("SUCCESSCODE");
    assert.ok(successResult.ok, "FAIL: Should return ok=true for success");

    console.log("  ✓ redeemJoinCode correctly structured\n");
  }

  console.log("✅ All L2 behavioral tests passed");
}

main().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
