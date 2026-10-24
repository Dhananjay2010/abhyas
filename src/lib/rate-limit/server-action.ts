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
 * getSessionUser() is cached per request (React cache), so calling it here and
 * then getAuthedClient() in the action does not cause duplicate auth checks.
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

  // Extract IP using same logic as getClientIp but from Next.js headers()
  const vercelForwarded = headersList.get("x-vercel-forwarded-for");
  const realIp = headersList.get("x-real-ip");
  const forwarded = headersList.get("x-forwarded-for");

  let ip = "127.0.0.1";
  if (vercelForwarded) {
    ip = vercelForwarded.trim();
  } else if (realIp) {
    ip = realIp;
  } else if (forwarded) {
    const parsed = forwarded.split(",")[0].trim();
    if (parsed) ip = parsed;
  }

  // Key by userId for authenticated users, IP for unauthenticated
  // getSessionUser is cached per request, so this doesn't duplicate work
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
