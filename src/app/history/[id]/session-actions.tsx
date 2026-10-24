"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSession } from "../actions";

interface SessionActionsProps {
  sessionId: string;
}

export function SessionActions({ sessionId }: SessionActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const [showUndo, setShowUndo] = useState(false);
  const [undoTimeout, setUndoTimeout] = useState<NodeJS.Timeout | null>(null);

  const handleDelete = () => {
    setShowConfirm(true);
  };

  const confirmDelete = () => {
    setShowConfirm(false);
    setShowUndo(true);

    // Set a timeout for actual deletion
    const timeout = setTimeout(() => {
      startTransition(async () => {
        await deleteSession(sessionId);
        router.push("/history");
      });
    }, 5000);

    setUndoTimeout(timeout);
  };

  const handleUndo = () => {
    if (undoTimeout) {
      clearTimeout(undoTimeout);
      setUndoTimeout(null);
    }
    setShowUndo(false);
  };

  return (
    <>
      <div className="mt-8 border-t border-border pt-6">
        <button
          onClick={handleDelete}
          disabled={isPending || showUndo}
          className="w-full rounded-lg border border-destructive bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Delete Session
        </button>
      </div>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold">Delete Session?</h2>
            <p className="mt-2 text-sm text-muted">
              This will permanently delete this session and all its data. You&apos;ll have 5 seconds to
              undo.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium transition-colors hover:border-muted/50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 rounded-lg border border-destructive bg-destructive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-destructive/90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo Toast */}
      {showUndo && (
        <div className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-lg">
          <span className="text-sm">Session deleted</span>
          <button
            onClick={handleUndo}
            className="rounded bg-accent px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          >
            Undo
          </button>
        </div>
      )}
    </>
  );
}
