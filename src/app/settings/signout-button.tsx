"use client";

import { useState, useTransition } from "react";
import { signOutAction } from "@/lib/auth/signout";
import { clearAllPendingSetsForUser } from "@/lib/session/pending-set-retry";
import { clearPendingChanges } from "@/lib/auth/pending-changes";

export function SignOutButton({ 
  userId,
  signOut = signOutAction,
  clearSets = clearAllPendingSetsForUser,
}: { 
  userId: string;
  signOut?: typeof signOutAction;
  clearSets?: typeof clearAllPendingSetsForUser;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    startTransition(async () => {
      clearPendingChanges();
      // Clear pending sets before sign-out (signOut redirects on success and never returns)
      if (typeof window !== "undefined") {
        clearSets(window.localStorage, userId);
      }
      const result = await signOut();
      // If we reach here, signOut failed (success redirects and never returns)
      if (!result.ok) {
        // Show a friendly error message instead of exposing internal error details
        setError("Unable to sign out. Please try again.");
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
