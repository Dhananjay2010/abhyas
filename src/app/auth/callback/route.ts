import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureProfileRows } from "@/lib/auth/ensure-profile";
import { withRateLimit } from "@/lib/rate-limit/route-handler";
import { getRedirectOrigin, safeNextPath } from "@/lib/auth/redirect-origin";

async function handleAuthCallback(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      /*
        Every sign-in passes through here, which makes it the one place that can
        guarantee a new user has the rows the rest of the app assumes. The
        `on_auth_user_created` trigger is supposed to do this and normally does;
        it was silently lost in the move to Mumbai, and for three days every
        signup landed on a blank page. Cheap, idempotent, and the difference
        between a working signup and no signup at all.
      */
      if (data?.user) await ensureProfileRows(supabase, data.user);

      // Build redirect origin from forwarded headers (Vercel) or request URL (local)
      const base = getRedirectOrigin(request);
      return NextResponse.redirect(`${base}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth_failed`);
}

export const GET = withRateLimit(handleAuthCallback, { type: "auth" });
