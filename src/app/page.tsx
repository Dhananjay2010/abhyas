import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { SignInButton } from "./sign-in-button";
import { Footer } from "@/components/footer";
import { branding } from "@/lib/branding";
import { BrandLogo } from "@/components/brand-logo";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { supabase, user } = await getAuthedClient();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("id", user.id)
      .single();
    redirect(profile?.onboarding_completed_at ? "/today" : "/onboarding");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-between px-6 py-12">
      <div className="flex flex-1 flex-col justify-center">
        {branding.tagline && (
          <p lang="hi" className="text-base font-medium text-accent">
            {branding.tagline}
          </p>
        )}
        <div className="mt-3">
          <BrandLogo className="h-12" />
        </div>
        <p className="mt-5 text-lg leading-relaxed text-muted">
          {branding.description}
        </p>

        <ul className="mt-10 space-y-4 text-sm text-muted">
          {[
            "15 minutes of warm-up built around what you are about to train",
            "Weights, bodyweight, yoga or breathing — your call",
            "Every set recorded, so the weight goes up when you are ready",
          ].map((line) => (
            <li key={line} className="flex gap-3">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-12">
        {error === "auth_failed" && (
          <p className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            Sign-in did not complete. Please try again.
          </p>
        )}
        <SignInButton />
      </div>

      <Footer />
    </main>
  );
}
