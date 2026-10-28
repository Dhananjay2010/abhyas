import { getLandingRedirectTarget } from "@/lib/auth/sign-in-redirect";
import { safeNextPath } from "@/lib/auth/redirect-origin";
import { buildLandingBrandProp } from "@/lib/landing-props";
import type { BrandResolution } from "@/lib/runtime-brand";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { LandingContent } from "./landing-content";

export type LandingPageProps = {
  error?: string;
  next?: string;
};

export type LandingPageDeps = {
  getAuthedClient: () => Promise<{ supabase: SupabaseClient<Database>; user: User | null }>;
  getRequestBrandResolution: () => Promise<BrandResolution>;
  redirect: (url: string) => never;
};

/**
 * Render landing page with injectable dependencies for testing.
 * Extracted from page.tsx to enable M10c mutant testing.
 */
export async function renderLandingPage(
  props: LandingPageProps,
  deps: LandingPageDeps
) {
  const { error, next } = props;
  const { supabase, user } = await deps.getAuthedClient();

  if (user) {
    // Check if onboarding is complete
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("id", user.id)
      .single();

    // Determine redirect target based on onboarding status and next parameter
    const target = getLandingRedirectTarget(profile?.onboarding_completed_at, next, safeNextPath);
    deps.redirect(target);
  }

  // Get runtime brand for white-label hosting
  const { brand } = await buildLandingBrandProp(deps.getRequestBrandResolution);
  
  return <LandingContent brand={brand} error={error} next={next} />;
}
