"use client";

import { useState, useTransition } from "react";
import { clearPendingChanges } from "@/lib/auth/pending-changes";
import { signOutAction } from "@/lib/auth/signout";
import { clearAllPendingSetsForUser } from "@/lib/session/pending-set-retry";

export function SignOutForm({ 
  label,
  userId,
  signOut = signOutAction,
  clearSets = clearAllPendingSetsForUser,
}: { 
  label: string;
  userId: string;
  signOut?: typeof signOutAction;
  clearSets?: typeof clearAllPendingSetsForUser;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    startTransition(async () => {
      clearPendingChanges();
      
      // Save pending sets before attempting sign-out
      let savedQueue: string | null = null;
      if (typeof window !== "undefined") {
        const key = `pending-sets:${userId}`;
        savedQueue = window.localStorage.getItem(key);
        clearSets(window.localStorage, userId);
      }
      
      const result = await signOut();
      // If we reach here, signOut failed (success redirects and never returns)
      if (!result.ok) {
        // Restore the queue since sign-out failed
        if (typeof window !== "undefined" && savedQueue) {
          const key = `pending-sets:${userId}`;
          window.localStorage.setItem(key, savedQueue);
        }
        setError("Unable to sign out. Please try again.");
      }
    });
  }

  return (
    <div>
      <button
        onClick={handleSignOut}
        disabled={pending}
        className="w-full rounded-xl border border-border bg-surface-2 px-6 py-3 text-sm font-medium text-muted transition-colors hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? "Signing out..." : label}
      </button>
      {error && (
        <p className="mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
