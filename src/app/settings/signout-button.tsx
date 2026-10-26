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
      
      let result;
      try {
        result = await signOut();
      } catch {
        // signOut threw - queue stays untouched
        setError("Unable to sign out. Please try again.");
        return;
      }
      
      // If we reach here, signOut did not throw
      // If it returns an error, queue stays untouched
      if (!result.ok) {
        setError("Unable to sign out. Please try again.");
        return;
      }
      
      // Success - clear the queue before redirect
      // (redirect will happen and this component will unmount, but clear happens first)
      if (typeof window !== "undefined") {
        clearSets(window.localStorage, userId);
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
