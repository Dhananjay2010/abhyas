"use client";

import { signOutAction } from "@/lib/auth/signout";
import { logSet } from "@/app/session/actions";
import { useSignOut } from "@/lib/auth/use-signout";
import { SignOutFormView } from "@/app/today/signout-form";

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

  return (
    <SignOutFormView
      label="Sign out"
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
