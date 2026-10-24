"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { deleteAccount } from "./actions";
import { ErrorNote, inputClass, PrimaryButton } from "@/components/ui";

const CONFIRMATION_WORD = "DELETE";

export function DeleteAccountForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmationText, setConfirmationText] = useState("");

  const ready = confirmationText === CONFIRMATION_WORD && !pending;

  function handleDelete() {
    if (!ready) return;
    
    startTransition(async () => {
      const result = await deleteAccount();
      if (!result.ok) {
        setError(result.error);
      }
      // If successful, the action redirects to the landing page after sign out
    });
  }

  return (
    <div className="mt-8 space-y-6">
      <div>
        <p className="text-sm text-muted mb-4">
          To confirm deletion, type <strong className="text-fg">{CONFIRMATION_WORD}</strong> in the
          box below:
        </p>
        <input
          type="text"
          value={confirmationText}
          onChange={(e) => setConfirmationText(e.target.value.trim())}
          placeholder={CONFIRMATION_WORD}
          disabled={pending}
          className={inputClass}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
        />
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="flex gap-3">
        <Link
          href="/settings"
          className="flex-1 rounded-xl border border-border bg-surface-2 px-6 py-3 text-center text-sm font-medium text-muted transition-colors hover:text-fg"
        >
          Cancel
        </Link>
        <div className="flex-1">
          <PrimaryButton
            disabled={!ready}
            onClick={handleDelete}
          >
            {pending ? "Deleting…" : "Delete my account"}
          </PrimaryButton>
        </div>
      </div>

      <p className="text-xs text-center text-muted">
        This will sign you out and permanently delete all your data.
      </p>
    </div>
  );
}
