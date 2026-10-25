import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureProfileRows } from "@/lib/auth/ensure-profile";
import { withRateLimit } from "@/lib/rate-limit/route-handler";
import { getRedirectOrigin, safeNextPath } from "@/lib/auth/redirect-origin";
import { getLandingRedirectTarget } from "@/lib/auth/sign-in-redirect";

async function handleAuthCallback(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");

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

      // Load profile to check onboarding status
      let onboardingCompletedAt: string | null = null;
      if (data?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_completed_at')
          .eq('id', data.user.id)
          .single();
        onboardingCompletedAt = profile?.onboarding_completed_at ?? null;
      }

      // Determine redirect target based on onboarding status and next parameter
      const redirectPath = getLandingRedirectTarget(
        onboardingCompletedAt,
        nextParam,
        safeNextPath
      );

      // Build redirect origin from forwarded headers (Vercel) or request URL (local)
      const base = getRedirectOrigin(request);
      return NextResponse.redirect(`${base}${redirectPath}`);
    }
  }

  // Build redirect origin for error path using the same logic as success
  const base = getRedirectOrigin(request);
  return NextResponse.redirect(`${base}/?error=auth_failed`);
}

export const GET = withRateLimit(handleAuthCallback, { type: "auth" });
