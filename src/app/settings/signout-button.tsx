"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();

  async function handleSignOut() {
    startTransition(async () => {
      clearPendingChanges();
      
      let result;
      try {
        result = await signOut();
      } catch {
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
      
      // Replace (not push) so /settings isn't in history, then refresh
      router.replace("/");
      router.refresh();
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
