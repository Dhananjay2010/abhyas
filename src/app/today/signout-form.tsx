"use client";

import { signOutAction } from "@/lib/auth/signout";
import { logSet } from "@/app/session/actions";
import { useSignOut } from "@/lib/auth/use-signout";
import { useState } from "react";

export type SignOutFormViewProps = {
  label: string;
  pending: boolean;
  error: string | null;
  pendingCount: number;
  showWarning: boolean;
  handleSignOut: () => void;
  handleSyncNow: () => void;
  handleSignOutAnyway: () => void;
};

export function SignOutFormView({
  label,
  pending,
  error,
  pendingCount,
  showWarning,
  handleSignOut,
  handleSyncNow,
  handleSignOutAnyway,
}: SignOutFormViewProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  if (showWarning) {
    if (showConfirm) {
      return (
        <div>
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <p className="text-sm text-fg mb-3">
              Sign out anyway? Sets that haven&apos;t saved yet on this device will be lost.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={pending}
                className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  handleSignOutAnyway();
                }}
                disabled={pending}
                className="flex-1 rounded-lg border border-border bg-danger px-4 py-2 text-sm font-medium text-danger-fg transition-colors hover:bg-danger-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? "Signing out..." : "Sign out anyway"}
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
              onClick={() => setShowConfirm(true)}
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
      <form onSubmit={(e) => {
        e.preventDefault();
        handleSignOut();
      }}>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl border border-border bg-surface-2 px-6 py-3 text-sm font-medium text-muted transition-colors hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Signing out..." : label}
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

export function SignOutForm({ 
  label,
  userId,
  signOut = signOutAction,
  logSet: logSetProp = logSet,
  now,
}: { 
  label: string;
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

  return (
    <SignOutFormView
      label={label}
      pending={pending}
      error={error}
      pendingCount={pendingCount}
      showWarning={showWarning}
      handleSignOut={handleSignOut}
      handleSyncNow={handleSyncNow}
      handleSignOutAnyway={handleSignOutAnyway}
    />
  );
}
