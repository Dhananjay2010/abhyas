import type { Database } from "@/lib/database.types";
import { formatJoinCodeDate } from "@/lib/format-join-code-date";

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
    const formattedDate = formatJoinCodeDate(expiry, timezone);
    if (expiry <= now) {
      return `Expired ${formattedDate}`;
    }
    return `Expires ${formattedDate}`;
  }
  return null;
}
