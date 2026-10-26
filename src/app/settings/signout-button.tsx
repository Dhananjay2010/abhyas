"use client";

import { signOutAction } from "@/lib/auth/signout";
import { logSet } from "@/app/session/actions";
import { useSignOut } from "@/lib/auth/use-signout";

export function SignOutButton({ 
  userId,
  signOut = signOutAction,
  logSet: logSetProp = logSet,
  now,
}: { 
  userId: string;
  signOut?: typeof signOutAction;
  logSet?: typeof logSet;
  now?: Date;
}) {
  const {
    pending,
    error,
    pendingCount,
    showWarning,
    handleSignOut,
    handleSyncNow,
    handleSignOutAnyway,
  } = useSignOut({ userId, signOut, logSet: logSetProp, now });

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
      <form method="post" action="/auth/signout" onSubmit={(e) => {
        e.preventDefault();
        handleSignOut();
      }}>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl border border-border bg-surface-2 px-6 py-3 text-sm font-medium text-muted transition-colors hover:text-fg text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Signing out..." : "Sign out"}
        </button>
      </form>
      {error && (
        <p className="mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
