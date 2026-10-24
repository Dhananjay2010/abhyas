import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp, createRateLimitKey, type RateLimitType } from "./index";

/**
 * Wrapper for Next.js route handlers that applies rate limiting.
 * 
 * Returns 429 Too Many Requests with Retry-After header when limit is exceeded.
 * 
 * @example
 * ```ts
 * export const GET = withRateLimit(
 *   async (request: Request) => {
 *     // handler implementation
 *   },
 *   { type: "auth" }
 * );
 * ```
 */
export function withRateLimit<T extends Request>(
  handler: (request: T, context?: unknown) => Promise<Response>,
  options: {
    type?: RateLimitType;
    getUserId?: (request: T) => Promise<string | undefined>;
  } = {},
): (request: T, context?: unknown) => Promise<Response> {
  const { type = "default", getUserId } = options;

  return async (request: T, context?: unknown): Promise<Response> => {
    const ip = getClientIp(request);
    const userId = getUserId ? await getUserId(request) : undefined;
    const key = createRateLimitKey(ip, userId);

    const result = await checkRateLimit(key, type);

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Too many requests",
          message: "You have exceeded the rate limit. Please try again later.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(result.retryAfter ?? 60),
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": String(result.remaining),
            "X-RateLimit-Reset": String(result.reset),
          },
        },
      );
    }

    return handler(request, context);
  };
}
