"use client";

import { useState, useTransition } from "react";
import { signOutAction } from "@/lib/auth/signout";
import { clearAllPendingSetsForUser } from "@/lib/session/pending-set-retry";
import { clearPendingChanges } from "@/lib/auth/pending-changes";

export function SignOutButton({ userId }: { userId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    if (typeof window !== "undefined") {
      clearAllPendingSetsForUser(window.localStorage, userId);
    }
    
    startTransition(async () => {
      clearPendingChanges();
      const result = await signOutAction();
      if (!result.ok) {
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
