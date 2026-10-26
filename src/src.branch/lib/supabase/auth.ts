import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type SessionUser = { id: string; email: string | null };

/**
 * Identify the signed-in user without a round trip to the auth server.
 *
 * `getUser()` is an HTTP call to Supabase's `/auth/v1/user` on every single
 * invocation. Because the proxy verifies the session and then every page and
 * every server action verified it again, one tap on a tab used to pay for two
 * of those calls before any of the page's own data was fetched.
 *
 * `getClaims()` verifies the access token's signature locally against the
 * project's published JWKS (this project signs with ES256), so in the steady
 * state it costs no network at all — the key set is fetched once per warm
 * server instance and cached in the auth library's module scope.
 *
 * Two properties of `getClaims()` make the swap safe rather than merely fast:
 *
 * 1. It reads the session through `getSession()`, which still refreshes an
 *    access token that is at or near expiry and writes the new cookies back.
 *    That is the behaviour the "do not remove" note in the proxy protects.
 * 2. When a token cannot be verified locally — a project still on legacy HS256
 *    symmetric secrets, a runtime without WebCrypto, an unknown key id — it
 *    falls back to `getUser()` by itself. The worst case is the latency we
 *    have today; it cannot lock anyone out.
 *
 * The trade-off worth stating: a locally verified token is trusted until it
 * expires, so a session revoked server-side stays usable for the remainder of
 * the access token's hour. For a personal training log that is the right side
 * of the trade.
 */
async function readClaims(
  supabase: SupabaseClient<Database>,
): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return {
    id: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
  };
}

/** Per-render memoised: several components may ask, only one verification happens. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  return readClaims(supabase);
});

/**
 * The client and the user together, for the common case of a page or action
 * that needs both. Shares the memoised client and the memoised claims.
 */
export async function getAuthedClient() {
  const supabase = await createClient();
  const user = await getSessionUser();
  return { supabase, user };
}

export { readClaims };
