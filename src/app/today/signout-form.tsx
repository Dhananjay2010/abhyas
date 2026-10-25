"use client";

import { clearPendingChanges } from "@/lib/auth/pending-changes";

export function SignOutForm({ label }: { label: string }) {
  function handleSubmit() {
    clearPendingChanges();
  }

  return (
    <form action="/auth/signout" method="post" onSubmit={handleSubmit}>
      <button className="w-full rounded-xl border border-border bg-surface-2 px-6 py-3 text-sm font-medium text-muted transition-colors hover:text-fg">
        {label}
      </button>
    </form>
  );
}
