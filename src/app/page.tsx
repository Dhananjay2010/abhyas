import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { safeNextPath } from "@/lib/auth/redirect-origin";
import { getLandingRedirectTarget } from "@/lib/auth/sign-in-redirect";
import { LandingContent } from "./landing-content";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const { supabase, user } = await getAuthedClient();

  if (user) {
    // Check if onboarding is complete
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("id", user.id)
      .single();

    // Determine redirect target based on onboarding status and next parameter
    const target = getLandingRedirectTarget(profile?.onboarding_completed_at, next, safeNextPath);
    redirect(target);
  }

  return <LandingContent error={error} next={next} />;
}
