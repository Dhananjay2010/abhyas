import { headers } from "next/headers";
import { checkRateLimit, createRateLimitKey, type RateLimitType } from "./index";
import { getSessionUser } from "@/lib/supabase/auth";

type ActionResult<T = unknown> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

/**
 * Check rate limit within a server action.
 * 
 * Automatically keys by userId for authenticated users, IP for unauthenticated.
 * Returns an error result when limit is exceeded.
 * Call this at the start of server actions that need rate limiting.
 * 
 * @example
 * ```ts
 * export async function expensiveAction(): Promise<ActionResult> {
 *   const rateLimit = await checkActionRateLimit("expensive");
 *   if (rateLimit) return rateLimit;
 *   
 *   // action implementation
 * }
 * ```
 */
export async function checkActionRateLimit(
  type: RateLimitType = "default",
): Promise<ActionResult | null> {
  const headersList = await headers();
  
  const forwarded = headersList.get("x-forwarded-for");
  const realIp = headersList.get("x-real-ip");
  
  let ip = "127.0.0.1";
  if (forwarded) {
    const parsed = forwarded.split(",")[0].trim();
    if (parsed) ip = parsed;
  } else if (realIp) {
    ip = realIp;
  }

  // Key by userId for authenticated users, IP for unauthenticated
  const user = await getSessionUser();
  const key = createRateLimitKey(ip, user?.id);
  const result = await checkRateLimit(key, type);

  if (!result.success) {
    const retryMinutes = result.retryAfter ? Math.ceil(result.retryAfter / 60) : 1;
    return {
      ok: false,
      error: `Too many requests. Please wait ${retryMinutes} minute${retryMinutes === 1 ? "" : "s"} before trying again.`,
    };
  }

  return null;
}
