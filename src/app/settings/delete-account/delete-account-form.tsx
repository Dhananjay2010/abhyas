"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { deleteAccount } from "./actions";
import { deleteErrorMessage, isDeleteConfirmed } from "./form-logic";
import { ErrorNote, inputClass, PrimaryButton } from "@/components/ui";

const CONFIRMATION_WORD = "DELETE";

export function DeleteAccountForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmationText, setConfirmationText] = useState("");

  const ready = isDeleteConfirmed(confirmationText) && !pending;

  function handleDelete() {
    if (!ready) return;
    
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteAccount(confirmationText);
        const errorMsg = deleteErrorMessage(result);
        if (errorMsg) {
          setError(errorMsg);
        }
        // If no error (successful deletion), the action redirects to the landing page after sign out
      } catch (err) {
        // Catch any thrown errors (e.g. fetch failures) to prevent hitting error boundary
        const errorMsg = deleteErrorMessage({ thrown: err });
        if (errorMsg) {
          setError(errorMsg);
        }
      }
    });
  }

  return (
    <div className="mt-8 space-y-6">
      <div>
        <label htmlFor="delete-confirmation" className="sr-only">
          Type {CONFIRMATION_WORD} to confirm deletion
        </label>
        <p id="delete-instructions" className="text-sm text-muted mb-4">
          To confirm deletion, type <strong className="text-fg">{CONFIRMATION_WORD}</strong> in the
          box below:
        </p>
        <input
          id="delete-confirmation"
          type="text"
          value={confirmationText}
          onChange={(e) => setConfirmationText(e.target.value)}
          placeholder={CONFIRMATION_WORD}
          disabled={pending}
          className={inputClass}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          aria-describedby="delete-instructions"
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
