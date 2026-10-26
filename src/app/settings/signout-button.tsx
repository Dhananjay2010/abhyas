"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOutAction } from "@/lib/auth/signout";
import { replayAllPendingSetsForUser } from "@/lib/session/pending-set-retry";
import { createPendingSetDeps } from "@/lib/session/pending-set-deps";
import { clearPendingChanges } from "@/lib/auth/pending-changes";
import { isSessionExpired } from "@/lib/auth/session-expired";
import { logSet } from "@/app/session/actions";

export function SignOutButton({ 
  userId,
  signOut = signOutAction,
  logSet: logSetProp = logSet,
}: { 
  userId: string;
  signOut?: typeof signOutAction;
  logSet?: typeof logSet;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [showWarning, setShowWarning] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    startTransition(async () => {
      setError(null);
      clearPendingChanges();
      
      // First, try to replay all pending sets
      if (typeof window !== "undefined") {
        const deps = createPendingSetDeps();
        const remaining = await replayAllPendingSetsForUser(
          window.localStorage,
          userId,
          deps,
          logSetProp
        );
        
        // If sets are still pending, show warning
        if (remaining > 0) {
          setPendingCount(remaining);
          setShowWarning(true);
          return;
        }
      }
      
      // Queue is empty, proceed with sign out
      await performSignOut();
    });
  }

  async function handleSyncNow() {
    startTransition(async () => {
      setError(null);
      
      // Try replay again
      if (typeof window !== "undefined") {
        const deps = createPendingSetDeps();
        const remaining = await replayAllPendingSetsForUser(
          window.localStorage,
          userId,
          deps,
          logSetProp
        );
        
        // If still pending, update count
        if (remaining > 0) {
          setPendingCount(remaining);
          return;
        }
      }
      
      // Success - sign out
      setShowWarning(false);
      await performSignOut();
    });
  }

  async function handleSignOutAnyway() {
    startTransition(async () => {
      setError(null);
      setShowWarning(false);
      // Sign out without clearing the queue
      await performSignOut();
    });
  }

  async function performSignOut() {
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
    
    // Success - navigate (queue is already empty or kept for replay)
    router.replace("/");
    router.refresh();
  }

  if (showWarning) {
    return (
      <div>
        <div className="rounded-xl border border-border bg-surface-2 p-4">
          <p className="text-sm text-fg mb-3">
            {pendingCount === 1
              ? "1 set hasn't synced yet"
              : `${pendingCount} sets haven't synced yet`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleSyncNow}
              disabled={pending}
              className="flex-1 rounded-lg border border-border bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? "Syncing..." : "Sync now"}
            </button>
            <button
              onClick={handleSignOutAnyway}
              disabled={pending}
              className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Sign out anyway
            </button>
          </div>
        </div>
        {error && (
          <p className="mt-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    );
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
