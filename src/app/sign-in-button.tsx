"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SignInButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      // Surface the real reason on screen rather than hiding it in the console.
      setError(error.message);
      setPending(false);
    }
  }

  return (
    <div className="w-full">
      <button
        onClick={signIn}
        disabled={pending}
        className="flex w-full items-center justify-center gap-3 rounded-xl bg-accent px-6 py-4 text-base font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M12.24 10.29v3.63h5.09a4.36 4.36 0 0 1-1.9 2.86v2.36h3.07c1.8-1.66 2.84-4.1 2.84-7a8.6 8.6 0 0 0-.14-1.55Z" />
          <path fill="currentColor" d="M12.24 21.5c2.56 0 4.71-.85 6.28-2.3l-3.07-2.37c-.85.57-1.94.91-3.21.91-2.47 0-4.56-1.67-5.31-3.9H3.76v2.44a9.49 9.49 0 0 0 8.48 5.22Z" />
          <path fill="currentColor" d="M6.93 13.84a5.7 5.7 0 0 1 0-3.64V7.76H3.76a9.5 9.5 0 0 0 0 8.52Z" />
          <path fill="currentColor" d="M12.24 6.3c1.39 0 2.64.48 3.63 1.42l2.72-2.72A9.13 9.13 0 0 0 12.24 2.5 9.49 9.49 0 0 0 3.76 7.76l3.17 2.44c.75-2.23 2.84-3.9 5.31-3.9Z" />
        </svg>
        {pending ? "Opening Google…" : "Continue with Google"}
      </button>

      {error && (
        <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
