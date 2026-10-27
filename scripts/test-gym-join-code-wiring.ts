import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "@/lib/database.types";

type JoinCode = Database["public"]["Tables"]["gym_join_codes"]["Row"];

async function runTests() {
  console.log("=== TEST: Gym join code wiring integrity ===\n");

  // W1: Verify processRedeemResult receives gymName parameter and uses it
  console.log("TEST: W1 - processRedeemResult uses gymName");
  const { processRedeemResult } = await import("@/lib/redeem-join-code-errors");

  const alreadyMemberResult = processRedeemResult(
    { ok: false, reason: "already_member" },
    "Test Gym"
  );
  assert.ok(!alreadyMemberResult.ok, "FAIL: already_member result should not be ok");
  if (!alreadyMemberResult.ok) {
    assert.match(
      alreadyMemberResult.error,
      /Test Gym/,
      "FAIL: already_member error must include gym name"
    );
  }
  console.log("  ✓ processRedeemResult uses gymName\n");

  // W2: Verify actions.ts calls preview_join_code RPC to look up gymName server-side
  console.log("TEST: W2 - actions.ts uses preview_join_code RPC");
  const actionsSource = readFileSync(join(__dirname, "..", "src", "app", "join", "[code]", "actions.ts"), "utf-8");
  assert.match(
    actionsSource,
    /\.rpc\("preview_join_code"/,
    "FAIL: actions.ts must call preview_join_code RPC"
  );
  assert.match(
    actionsSource,
    /toUpperCase\(\)/,
    "FAIL: actions.ts must normalize code with toUpperCase()"
  );
  assert.match(
    actionsSource,
    /parsePreviewJoinCodeResult/,
    "FAIL: actions.ts must parse preview result"
  );
  console.log("  ✓ actions.ts uses preview_join_code RPC\n");

  // W3: Verify gating uses code role in comparison
  console.log("TEST: W3 - determineJoinGating uses code role");
  const { determineJoinGating } = await import("@/lib/gym-join-code-gating");

  const memberRedeemingOwner = determineJoinGating("member", "owner");
  assert.ok(!memberRedeemingOwner.alreadyInAtSameOrHigher, "FAIL: member can redeem owner code");

  const ownerRedeemingMember = determineJoinGating("owner", "member");
  assert.ok(ownerRedeemingMember.alreadyInAtSameOrHigher, "FAIL: owner cannot redeem member code");

  const memberRedeemingMember = determineJoinGating("member", "member");
  assert.ok(memberRedeemingMember.alreadyInAtSameOrHigher, "FAIL: member already has member role");
  console.log("  ✓ determineJoinGating uses code role correctly\n");

  // W4: Verify join page imports and uses mapPreviewResultToMessage
  console.log("TEST: W4 - join page uses mapPreviewResultToMessage");
  const pageSource = readFileSync(join(__dirname, "..", "src", "app", "join", "[code]", "page.tsx"), "utf-8");
  assert.match(
    pageSource,
    /import.*mapPreviewResultToMessage.*from/,
    "FAIL: page must import mapPreviewResultToMessage"
  );
  assert.match(
    pageSource,
    /mapPreviewResultToMessage\(/,
    "FAIL: page must call mapPreviewResultToMessage"
  );
  console.log("  ✓ join page uses mapPreviewResultToMessage\n");

  // W5: Verify splitJoinCodes separates active/inactive codes
  console.log("TEST: W5 - splitJoinCodes separates active/inactive");
  const { splitJoinCodes } = await import("@/lib/split-join-codes");

  const now = new Date("2024-01-15T12:00:00Z");
  const codes: JoinCode[] = [
    { 
      id: "1", code: "ACTIVE", expires_at: "2024-01-20T00:00:00Z", revoked_at: null,
      gym_id: "gym-1", role: "member" as const, created_by: "user-1", created_at: "2024-01-01T00:00:00Z",
      max_uses: null, use_count: 0
    },
    { 
      id: "2", code: "EXPIRED", expires_at: "2024-01-10T00:00:00Z", revoked_at: null,
      gym_id: "gym-1", role: "member" as const, created_by: "user-1", created_at: "2024-01-01T00:00:00Z",
      max_uses: null, use_count: 0
    },
    { 
      id: "3", code: "REVOKED", expires_at: null, revoked_at: "2024-01-12T00:00:00Z",
      gym_id: "gym-1", role: "member" as const, created_by: "user-1", created_at: "2024-01-01T00:00:00Z",
      max_uses: null, use_count: 0
    },
    { 
      id: "4", code: "NEVER_EXPIRES", expires_at: null, revoked_at: null,
      gym_id: "gym-1", role: "member" as const, created_by: "user-1", created_at: "2024-01-01T00:00:00Z",
      max_uses: null, use_count: 0
    },
  ];

  const split = splitJoinCodes(codes, now);
  assert.strictEqual(split.active.length, 2, "FAIL: should have 2 active codes");
  assert.strictEqual(split.inactive.length, 2, "FAIL: should have 2 inactive codes");

  const activeCodes = split.active.map((c) => c.code).sort();
  assert.deepStrictEqual(
    activeCodes,
    ["ACTIVE", "NEVER_EXPIRES"],
    "FAIL: active codes must be ACTIVE and NEVER_EXPIRES"
  );

  const inactiveCodes = split.inactive.map((c) => c.code).sort();
  assert.deepStrictEqual(
    inactiveCodes,
    ["EXPIRED", "REVOKED"],
    "FAIL: inactive codes must be EXPIRED and REVOKED"
  );
  console.log("  ✓ splitJoinCodes separates active/inactive correctly\n");

  // W6: Verify invites list imports and calls splitJoinCodes
  console.log("TEST: W6 - invites list uses splitJoinCodes");
  const invitesSource = readFileSync(join(__dirname, "..", "src", "app", "owner", "invites", "invites-list.tsx"), "utf-8");
  assert.match(
    invitesSource,
    /import.*splitJoinCodes.*from/,
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
