import { branding } from "@/lib/branding";
import { BrandLogo } from "@/components/brand-logo";
import { SignInButton } from "./sign-in-button";
import { Footer } from "@/components/footer";

export interface LandingContentProps {
  error?: string;
  next?: string;
}

export function LandingContent({ error, next }: LandingContentProps) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-between px-6 py-12">
      <div className="flex flex-1 flex-col justify-center">
        {branding.tagline && (
          <p 
            {...(branding.taglineLang && { lang: branding.taglineLang })} 
            className="text-base font-medium text-accent"
          >
            {branding.tagline}
          </p>
        )}
        <div className="mt-3">
          {branding.logo ? (
            <>
              <BrandLogo className="h-12 w-auto object-contain" />
              <h1 className="mt-2 text-sm font-medium text-muted">{branding.name}</h1>
            </>
          ) : (
            <h1 className="text-5xl font-bold tracking-tight">{branding.name}</h1>
          )}
        </div>
        <p className="mt-5 text-lg leading-relaxed text-muted">
          {branding.description}
        </p>

        <ul className="mt-10 space-y-4 text-sm text-muted">
          {[
            "Warm-up and cool-down built into every workout",
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
        <SignInButton next={next} />
      </div>

      <Footer />
    </main>
  );
}
