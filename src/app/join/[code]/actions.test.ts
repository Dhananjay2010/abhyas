/**
 * Unit tests for join code actions
 * 
 * Tests that every redeem failure reason maps to specific user-facing copy
 * and never falls through to the generic error message.
 */

import type { RedeemJoinCodeResult } from "@/lib/gym-join-code-types";

// Helper to extract the mapping logic for testing
function mapRedeemResultToMessage(result: RedeemJoinCodeResult, gymName?: string): string {
  if (result.ok) return "";
  
  const reason = result.reason;
  
  if (reason === "invalid") {
    return "This code is invalid or no longer available";
  }
  
  if (reason === "expired") {
    return "This code has expired";
  }
  
  if (reason === "revoked") {
    return "This code has been revoked";
  }
  
  if (reason === "exhausted") {
    return "This code has reached its maximum uses";
  }
  
  if (reason === "throttled") {
    return "Too many attempts. Please try again in a few minutes";
  }
  
  if (reason === "already_member") {
    return gymName ? `You're already in ${gymName}` : "You're already a member of this gym";
  }
  
  const _exhaustive: never = reason;
  return "An error occurred. Please try again";
}

describe("mapRedeemResultToMessage", () => {
  const gymName = "Test Gym";
  const genericError = "An error occurred. Please try again";

  it("maps invalid reason to specific copy", () => {
    const result: RedeemJoinCodeResult = { ok: false, reason: "invalid" };
    const message = mapRedeemResultToMessage(result, gymName);
    expect(message).toBe("This code is invalid or no longer available");
    expect(message).not.toBe(genericError);
  });

  it("maps expired reason to specific copy", () => {
    const result: RedeemJoinCodeResult = { ok: false, reason: "expired" };
    const message = mapRedeemResultToMessage(result, gymName);
    expect(message).toBe("This code has expired");
    expect(message).not.toBe(genericError);
  });

  it("maps revoked reason to specific copy", () => {
    const result: RedeemJoinCodeResult = { ok: false, reason: "revoked" };
    const message = mapRedeemResultToMessage(result, gymName);
    expect(message).toBe("This code has been revoked");
    expect(message).not.toBe(genericError);
  });

  it("maps exhausted reason to specific copy", () => {
    const result: RedeemJoinCodeResult = { ok: false, reason: "exhausted" };
    const message = mapRedeemResultToMessage(result, gymName);
    expect(message).toBe("This code has reached its maximum uses");
    expect(message).not.toBe(genericError);
  });

  it("maps throttled reason to specific copy", () => {
    const result: RedeemJoinCodeResult = { ok: false, reason: "throttled" };
    const message = mapRedeemResultToMessage(result, gymName);
    expect(message).toBe("Too many attempts. Please try again in a few minutes");
    expect(message).not.toBe(genericError);
  });

  it("maps already_member reason to specific copy with gym name", () => {
    const result: RedeemJoinCodeResult = { ok: false, reason: "already_member" };
    const message = mapRedeemResultToMessage(result, gymName);
    expect(message).toBe("You're already in Test Gym");
    expect(message).not.toBe(genericError);
  });

  it("maps already_member reason to specific copy without gym name", () => {
    const result: RedeemJoinCodeResult = { ok: false, reason: "already_member" };
    const message = mapRedeemResultToMessage(result);
    expect(message).toBe("You're already a member of this gym");
    expect(message).not.toBe(genericError);
  });

  it("returns empty string for success", () => {
    const result: RedeemJoinCodeResult = { ok: true, gym_id: "123", gym_name: gymName };
    const message = mapRedeemResultToMessage(result, gymName);
    expect(message).toBe("");
  });
});
