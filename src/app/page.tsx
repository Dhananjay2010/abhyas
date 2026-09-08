import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignInButton } from "./sign-in-button";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/today");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-between px-6 py-12">
      <div className="flex flex-1 flex-col justify-center">
        {/* No letter-spacing on Devanagari: it breaks the conjunct ligatures. */}
        <p lang="hi" className="text-base font-medium text-accent">
          अभ्यास
        </p>
        <h1 className="mt-3 text-5xl font-bold tracking-tight">Abhyas</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">
          One hour a day. We tell you exactly what to train, guide you through
          it with timers, and make next week harder than this one.
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
        <p className="mt-5 text-center text-xs leading-relaxed text-muted">
          Abhyas gives general fitness guidance, not medical advice. Talk to a
          doctor before starting if you have any health condition or injury.
        </p>
      </div>
    </main>
  );
}
