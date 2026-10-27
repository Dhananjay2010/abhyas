import type { Database } from "@/lib/database.types";

type JoinCode = Database["public"]["Tables"]["gym_join_codes"]["Row"];

export function isJoinCodeActive(code: JoinCode): boolean {
  if (code.revoked_at) return false;
  if (code.expires_at && new Date(code.expires_at) <= new Date()) return false;
  if (code.max_uses !== null && code.use_count >= code.max_uses) return false;
  return true;
}

export function formatJoinCodeExpiry(code: JoinCode, timezone: string): string | null {
  if (code.expires_at) {
    const expiry = new Date(code.expires_at);
    const now = new Date();
    if (expiry <= now) {
      return `Expired ${expiry.toLocaleDateString(undefined, { timeZone: timezone })}`;
    }
    return `Expires ${expiry.toLocaleDateString(undefined, { timeZone: timezone })}`;
  }
  return null;
}
