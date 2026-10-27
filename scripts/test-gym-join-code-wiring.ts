import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "@/lib/database.types";

type JoinCode = Database["public"]["Tables"]["gym_join_codes"]["Row"];

async function runTests() {
  console.log("=== TEST: Gym join code wiring integrity ===\n");

  // W1: Verify processRedeemResult uses server gym_name from already_member result
  console.log("TEST: W1 - processRedeemResult uses server gym_name");
  const { processRedeemResult } = await import("@/lib/redeem-join-code-errors");

  const alreadyMemberWithName = processRedeemResult({
    ok: false,
    reason: "already_member",
    gym_name: "PowerHouse Gym",
  });
  assert.ok(!alreadyMemberWithName.ok, "FAIL: already_member result should not be ok");
  if (!alreadyMemberWithName.ok) {
    assert.match(
      alreadyMemberWithName.error,
      /PowerHouse Gym/,
      "FAIL: processRedeemResult must use server gym_name from already_member result"
    );
  }
  console.log("  ✓ processRedeemResult uses server gym_name from result\n");

  // W2: Verify actions.ts calls processRedeemResult
  console.log("TEST: W2 - actions.ts calls processRedeemResult");
  const actionsSource = readFileSync(join(__dirname, "..", "src", "app", "join", "[code]", "actions.ts"), "utf-8");
  assert.match(
    actionsSource,
    /^import.*processRedeemResult.*from.*redeem-join-code-errors/m,
    "FAIL: actions.ts must import processRedeemResult"
  );
  assert.match(
    actionsSource,
    /return processRedeemResult\(data\);/,
    "FAIL: actions.ts must call processRedeemResult with RPC data"
  );
  console.log("  ✓ actions.ts calls processRedeemResult\n");

  // W3: Verify gating uses code role in comparison
  console.log("TEST: W3 - determineJoinGating uses code role in comparison");
  const { determineJoinGating } = await import("@/lib/gym-join-code-gating");

  const memberRedeemingOwner = determineJoinGating("member", "owner");
  assert.ok(!memberRedeemingOwner.alreadyInAtSameOrHigher, "FAIL: member can redeem owner code");

  const ownerRedeemingMember = determineJoinGating("owner", "member");
  assert.ok(ownerRedeemingMember.alreadyInAtSameOrHigher, "FAIL: owner cannot redeem member code (must use codeRole in comparison)");
  console.log("  ✓ determineJoinGating uses code role in comparison\n");

  // W4: Verify join page imports and uses mapPreviewResultToMessage
  console.log("TEST: W4 - join page uses mapPreviewResultToMessage");
  const pageSource = readFileSync(join(__dirname, "..", "src", "app", "join", "[code]", "page.tsx"), "utf-8");
  assert.match(
    pageSource,
    /^import.*mapPreviewResultToMessage.*from/m,
    "FAIL: join page must import mapPreviewResultToMessage"
  );
  assert.match(
    pageSource,
    /mapPreviewResultToMessage\(/,
    "FAIL: join page must call mapPreviewResultToMessage"
  );
  console.log("  ✓ join page uses mapPreviewResultToMessage\n");

  // W5: Verify splitJoinCodes expiry boundary (serves as expiry boundary test)
  console.log("TEST: W5 - splitJoinCodes expiry boundary (code expiring exactly now is inactive)");
  const { isCodeActive } = await import("@/lib/split-join-codes");

  const fixedNow = new Date("2024-01-15T12:00:00.000Z");
  const expiresExactlyNow: JoinCode = {
    id: "test-id",
    gym_id: "gym-id",
    code: "TESTCODE",
    role: "member",
    created_by: "user-id",
    created_at: "2024-01-01T00:00:00.000Z",
    expires_at: fixedNow.toISOString(),
    max_uses: null,
    use_count: 0,
    revoked_at: null,
  };

  assert.strictEqual(
    isCodeActive(expiresExactlyNow, fixedNow),
    false,
    "FAIL: code expiring exactly now must be inactive (kills <= to < mutant)"
  );
  console.log("  ✓ code expiring exactly now is inactive (boundary test)\n");

  // W6: Verify invites list imports and calls splitJoinCodes
  console.log("TEST: W6 - invites list uses splitJoinCodes");
  const invitesSource = readFileSync(join(__dirname, "..", "src", "app", "owner", "invites", "invites-list.tsx"), "utf-8");
  assert.match(
    invitesSource,
    /^import.*splitJoinCodes.*from/m,
    "FAIL: invites list must import splitJoinCodes"
  );
  assert.match(
    invitesSource,
    /splitJoinCodes\(/,
    "FAIL: invites list must call splitJoinCodes"
  );
  console.log("  ✓ invites list uses splitJoinCodes\n");

  console.log("✅ All wiring integrity tests passed");
}

runTests().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
