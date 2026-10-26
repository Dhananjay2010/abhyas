"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
      
      // Redirect to home
      router.push("/");
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
