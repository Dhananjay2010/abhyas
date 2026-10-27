/**
 * Type guards for gym join code RPC results
 * 
 * The preview_join_code and redeem_join_code RPCs return jsonb,
 * so we need runtime validation to safely narrow the types.
 */

export interface PreviewJoinCodeSuccess {
  ok: true;
  gym_name: string;
  gym_slug: string;
  role: string;
}

export interface PreviewJoinCodeFailure {
  ok: false;
  reason: "invalid" | "throttled";
}

export type PreviewJoinCodeResult = PreviewJoinCodeSuccess | PreviewJoinCodeFailure;

export interface RedeemJoinCodeSuccess {
  ok: true;
  gym_id: string;
  gym_name: string;
}

export interface RedeemJoinCodeFailure {
  ok: false;
  reason: "invalid" | "expired" | "revoked" | "exhausted" | "throttled" | "already_member";
}

export type RedeemJoinCodeResult = RedeemJoinCodeSuccess | RedeemJoinCodeFailure;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePreviewJoinCodeResult(data: unknown): PreviewJoinCodeResult | null {
  if (!isObject(data)) return null;
  
  if (data.ok === true) {
    if (
      typeof data.gym_name === "string" &&
      typeof data.gym_slug === "string" &&
      typeof data.role === "string"
    ) {
      return {
        ok: true,
        gym_name: data.gym_name,
        gym_slug: data.gym_slug,
        role: data.role,
      };
    }
    return null;
  }
  
  if (data.ok === false) {
    if (data.reason === "invalid" || data.reason === "throttled") {
      return {
        ok: false,
        reason: data.reason,
      };
    }
    return null;
  }
  
  return null;
}

export function parseRedeemJoinCodeResult(data: unknown): RedeemJoinCodeResult | null {
  if (!isObject(data)) return null;
  
  if (data.ok === true) {
    if (
      typeof data.gym_id === "string" &&
      typeof data.gym_name === "string"
    ) {
      return {
        ok: true,
        gym_id: data.gym_id,
        gym_name: data.gym_name,
      };
    }
    return null;
  }
  
  if (data.ok === false) {
    const validReasons = ["invalid", "expired", "revoked", "exhausted", "throttled", "already_member"];
    if (typeof data.reason === "string" && validReasons.includes(data.reason)) {
      return {
        ok: false,
        reason: data.reason as "invalid" | "expired" | "revoked" | "exhausted" | "throttled" | "already_member",
      };
    }
    return null;
  }
  
  return null;
}

/**
 * Parse create_join_code RPC result
 * Returns table(id uuid, code text) which supabase-js returns as an array
 */
export interface CreateJoinCodeResult {
  id: string;
  code: string;
}

export function parseCreateJoinCodeResult(data: unknown): CreateJoinCodeResult | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0];
  if (
    isObject(first) &&
    typeof first.id === "string" &&
    typeof first.code === "string"
  ) {
    return {
      id: first.id,
      code: first.code,
    };
  }
  return null;
}
