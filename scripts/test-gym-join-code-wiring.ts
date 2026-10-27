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

  // W2 behavioral: Verify processRedeemResult returns ok:false for all failure reasons
  console.log("TEST: W2 behavioral - processRedeemResult handles all failure cases");
  
  const invalidResult = processRedeemResult({ ok: false, reason: "invalid" });
  assert.ok(!invalidResult.ok, "FAIL: invalid code must return ok:false");
  if (!invalidResult.ok) {
    assert.ok(invalidResult.error.length > 0, "FAIL: invalid code must have error message");
  }

  const expiredResult = processRedeemResult({ ok: false, reason: "expired" });
  assert.ok(!expiredResult.ok, "FAIL: expired code must return ok:false");

  const revokedResult = processRedeemResult({ ok: false, reason: "revoked" });
  assert.ok(!revokedResult.ok, "FAIL: revoked code must return ok:false");

  const exhaustedResult = processRedeemResult({ ok: false, reason: "exhausted" });
  assert.ok(!exhaustedResult.ok, "FAIL: exhausted code must return ok:false");

  const throttledResult = processRedeemResult({ ok: false, reason: "throttled" });
  assert.ok(!throttledResult.ok, "FAIL: throttled request must return ok:false");

  const successResult = processRedeemResult({ ok: true, gym_id: "test-id", gym_name: "Test Gym" });
  assert.ok(successResult.ok, "FAIL: valid redemption must return ok:true");
  
  const invalidDataResult = processRedeemResult({ invalid: true });
  assert.ok(!invalidDataResult.ok, "FAIL: invalid RPC response must return ok:false");
  if (!invalidDataResult.ok) {
    assert.match(
      invalidDataResult.error,
      /Invalid response from server/,
      "FAIL: invalid RPC response must have parse error message"
    );
  }

  console.log("  ✓ processRedeemResult correctly handles all success and failure cases\n");

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

  // W4 behavioral: Verify mapPreviewResultToMessage returns correct messages
  const { mapPreviewResultToMessage } = await import("@/lib/preview-join-code-messages");

  const invalidPreview = mapPreviewResultToMessage({ ok: false, reason: "invalid" });
  assert.ok(typeof invalidPreview === "string" && invalidPreview.length > 0, "FAIL: invalid preview must return error message");

  const throttledPreview = mapPreviewResultToMessage({ ok: false, reason: "throttled" });
  assert.ok(typeof throttledPreview === "string" && throttledPreview.length > 0, "FAIL: throttled preview must return error message");

  console.log("  ✓ join page uses mapPreviewResultToMessage and it handles all cases\n");

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

  // W6 behavioral: Verify splitJoinCodes correctly splits codes
  const { splitJoinCodes } = await import("@/lib/split-join-codes");
  
  const now = new Date("2024-01-15T12:00:00.000Z");
  const activeCode: JoinCode = {
    id: "active-id",
    gym_id: "gym-id",
    code: "ACTIVE",
    role: "member",
    created_by: "user-id",
    created_at: "2024-01-01T00:00:00.000Z",
    expires_at: null,
    max_uses: null,
    use_count: 0,
    revoked_at: null,
  };

  const expiredCode: JoinCode = {
    ...activeCode,
    id: "expired-id",
    code: "EXPIRED",
    expires_at: "2024-01-14T12:00:00.000Z",
  };

  const revokedCode: JoinCode = {
    ...activeCode,
    id: "revoked-id",
    code: "REVOKED",
    revoked_at: "2024-01-14T12:00:00.000Z",
  };

  const exhaustedCode: JoinCode = {
    ...activeCode,
    id: "exhausted-id",
    code: "EXHAUSTED",
    max_uses: 5,
    use_count: 5,
  };

  const allCodes = [activeCode, expiredCode, revokedCode, exhaustedCode];
  const { active, inactive } = splitJoinCodes(allCodes, now);

  assert.strictEqual(active.length, 1, "FAIL: splitJoinCodes must return 1 active code");
  assert.strictEqual(active[0].code, "ACTIVE", "FAIL: active list must contain the active code");

  assert.strictEqual(inactive.length, 3, "FAIL: splitJoinCodes must return 3 inactive codes");
  const inactiveCodes = inactive.map(c => c.code).sort();
  assert.deepStrictEqual(inactiveCodes, ["EXHAUSTED", "EXPIRED", "REVOKED"], "FAIL: inactive list must contain expired, revoked, and exhausted codes");

  console.log("  ✓ invites list uses splitJoinCodes and it correctly splits active/inactive\n");

  console.log("✅ All wiring integrity tests passed");
}

runTests().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
