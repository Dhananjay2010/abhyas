"use client";

import { useState, useTransition } from "react";
import { signOutAction } from "@/lib/auth/signout";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    startTransition(async () => {
      const result = await signOutAction();
      // If we reach here, signOut failed (success redirects and never returns)
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <div>
      <button
        onClick={handleSignOut}
        disabled={pending}
        className="w-full rounded-xl border border-border bg-surface-2 px-6 py-3 text-sm font-medium text-muted transition-colors hover:text-fg text-left disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? "Signing out..." : "Sign out"}
      </button>
      {error && (
        <p className="mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
