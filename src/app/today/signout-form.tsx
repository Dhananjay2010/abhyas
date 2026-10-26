"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearPendingChanges } from "@/lib/auth/pending-changes";
import { signOutAction } from "@/lib/auth/signout";
import { clearAllPendingSetsForUser } from "@/lib/session/pending-set-retry";
import { isSessionExpired } from "@/lib/auth/session-expired";

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
  const router = useRouter();

  async function handleSignOut() {
    startTransition(async () => {
      clearPendingChanges();
      
      let result;
      try {
        result = await signOut();
      } catch (err) {
        // Check if this is an expired session error
        if (isSessionExpired(err)) {
          // Session is already expired, sign out locally and navigate
          // KEEP the queue - it's keyed by userId and will replay on next sign-in
          try {
            const res = await fetch("/auth/signout", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
            });
            if (!res.ok) {
              setError("Failed to sign out. Please try again.");
              return;
            }
          } catch {
            // If fetch fails, cookies might still be invalid; proceed with navigation
          }
          router.replace("/");
          router.refresh();
          return;
        }
        
        setError("Unable to sign out. Please try again.");
        return;
      }
      
      if (!result.ok) {
        setError("Unable to sign out. Please try again.");
        return;
      }
      
      // Success - clear the queue before redirect
      if (typeof window !== "undefined") {
        clearSets(window.localStorage, userId);
      }
      
      // Replace (not push) so /today isn't in history, then refresh
      router.replace("/");
      router.refresh();
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
