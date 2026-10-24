import { useCallback, useEffect, useRef, useState } from "react";
import {
  Outbox,
  createLocalStorage,
  mergePendingSets,
  type OutboxSender,
} from "@/lib/session/outbox";
import { mapErrorToUserMessage } from "@/lib/session/error-messages";
import { shouldAttemptFlush, nextRetryDelay, buildSendResult } from "@/lib/session/sync-helpers";
import * as actions from "../actions";

export type SyncState =
  | { type: "idle" }
  | { type: "syncing" }
  | { type: "offline" }
  | { type: "failed"; message: string }
  | { type: "quota" };

export function useSetOutbox<
  T extends {
    id: string;
    sets: Array<{
      setNumber: number;
      reps: number | null;
      weightKg: number | null;
      durationSeconds: number | null;
      pending?: boolean;
      failed?: boolean;
      unsaved?: boolean;
      failedError?: string;
      clientId?: string;
    }>;
  },
>(
  userId: string,
  sessionId: string,
  setExercises: React.Dispatch<React.SetStateAction<T[]>>,
) {
  const outboxRef = useRef<Outbox | null>(null);
  const [syncState, setSyncState] = useState<SyncState>({ type: "idle" });
  const [pendingCount, setPendingCount] = useState(0);
  const [unsavedCount, setUnsavedCount] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptsRef = useRef(0);
  const flushRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const flush = useCallback(async () => {
    const outbox = outboxRef.current;
    if (!outbox || outbox.pendingCount() === 0 || outbox.isFlushing()) return;

    // S9: Check if offline - don't count attempt, show "Waiting for connection"
    if (typeof navigator !== "undefined" && !shouldAttemptFlush(navigator.onLine)) {
      setSyncState({ type: "failed", message: "Waiting for connection" });
      // Don't increment retryAttemptsRef - wait for online event
      return;
    }

    setSyncState({ type: "syncing" });

    try {
      const result = await outbox.flush();

      // If skipped (concurrent flush already running), keep current sync state
      if (result.skipped) {
        setSyncState({ type: "idle" });
        return;
      }

      if (result.sentClientIds.length > 0) {
        // Clear pending flag on successfully synced sets (by clientId)
        setExercises((prev) =>
          prev.map((e) => {
            return {
              ...e,
              sets: e.sets.map((s) => {
                if (!s.pending || !s.clientId) return s;

                // Only clear if this clientId was successfully sent
                if (result.sentClientIds.includes(s.clientId)) {
                  // Remove pending and clientId flags
                  return {
                    setNumber: s.setNumber,
                    reps: s.reps,
                    weightKg: s.weightKg,
                    durationSeconds: s.durationSeconds,
                    ...(s.failed !== undefined && { failed: s.failed }),
                    ...(s.unsaved !== undefined && { unsaved: s.unsaved }),
                  } as typeof s;
                }
                return s;
              }),
            };
          }),
        );
      }

      // Check for failed sets and mark them
      const failed = outbox.getFailed();
      if (failed.length > 0) {
        setExercises((prev) =>
          prev.map((e) => {
            return {
              ...e,
              sets: e.sets.map((s) => {
                if (!s.clientId) return s;

                const failedMatch = failed.find(
                  (f) => f.set.clientId === s.clientId,
                );
                if (failedMatch) {
                  return {
                    ...s,
                    pending: false,
                    failed: true,
                    failedError: failedMatch.error,
                  };
                }
                return s;
              }),
            };
          }),
        );
      }

      // Update counts
      setPendingCount(outbox.pendingCount());
      setUnsavedCount(outbox.getFailed().length);

      // Check if empty and clean up storage
      if (outbox.isEmpty()) {
        outbox.clear();
      }

      if (outbox.pendingCount() === 0 && failed.length === 0) {
        // All sets synced - reset retry count
        retryAttemptsRef.current = 0;
        setSyncState({ type: "idle" });
      } else if (result.stopped) {
        // S9: Increment retry count and schedule next attempt with backoff
        retryAttemptsRef.current++;
        const delay = nextRetryDelay(retryAttemptsRef.current);
        setSyncState({ type: "failed", message: "Couldn't sync yet, retrying" });

        // Schedule retry
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
        }
        retryTimerRef.current = setTimeout(() => {
          flushRef.current?.();
        }, delay);
      } else {
        setSyncState({ type: "idle" });
      }
    } catch (err) {
      // Flush-time storage quota: sets were saved but can't update localStorage
      const rawMessage = err instanceof Error ? err.message : "Sync failed, will retry";
      if (rawMessage === "FLUSH_STORAGE_QUOTA_EXCEEDED") {
        setSyncState({
          type: "failed",
          message: "Saved, but this phone is out of space. Free some space to keep logging offline.",
        });
        return;
      }

      // Other errors: map to user-friendly text
      const mappedMessage = mapErrorToUserMessage(undefined, rawMessage);
      setSyncState({
        type: "failed",
        message: mappedMessage,
      });
    }
  }, [setExercises]); // setExercises is stable (React setState function)

  // Store flush in ref for recursive calls (done in useEffect to avoid render-time ref mutation)
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const enqueue = (
    exerciseId: string,
    setNumber: number,
    reps: number | null,
    weightKg: number | null,
    durationSeconds: number | null,
  ): string => {
    const outbox = outboxRef.current;
    if (!outbox) throw new Error("Outbox not initialized");

    const clientId = outbox.enqueue({
      sessionExerciseId: exerciseId,
      setNumber,
      reps,
      weightKg,
      durationSeconds,
    });

    setPendingCount(outbox.pendingCount());
    return clientId;
  };

  const remove = (clientId: string) => {
    const outbox = outboxRef.current;
    if (!outbox) return;

    outbox.remove(clientId);
    setPendingCount(outbox.pendingCount());
    setUnsavedCount(outbox.getFailed().length);
  };

  const clear = () => {
    const outbox = outboxRef.current;
    if (!outbox) return;

    outbox.clear();
    setPendingCount(0);
    setUnsavedCount(0);
  };

  // Initialize outbox once, on mount
  useEffect(() => {
    const sender: OutboxSender = {
      async send(set) {
        try {
          const result = await actions.logSet({
            sessionExerciseId: set.sessionExerciseId,
            setNumber: set.setNumber,
            reps: set.reps,
            weightKg: set.weightKg,
            durationSeconds: set.durationSeconds,
          });
          return buildSendResult(result, mapErrorToUserMessage);
        } catch (thrown) {
          return buildSendResult({ thrown }, mapErrorToUserMessage);
        }
      },
    };

    const storageKey = `abhyas:outbox:${userId}:${sessionId}`;
    const storage = createLocalStorage(storageKey);
    outboxRef.current = new Outbox(storage, sender, storageKey);

    // Merge pending and failed rows on mount (avoid hydration mismatch)
    const state = storage.get();
    if (state) {
      if (state.pending.length > 0) {
        setExercises((prev) => mergePendingSets(prev, state.pending));
      }
      if (state.failed.length > 0) {
        // Merge failed rows too
        setExercises((prev) =>
          prev.map((ex) => {
            const failedForExercise = state.failed.filter(
              (f) => f.set.sessionExerciseId === ex.id,
            );
            if (failedForExercise.length === 0) return ex;

            const merged = [...ex.sets];
            for (const f of failedForExercise) {
              const existing = merged.find(
                (s) => s.setNumber === f.set.setNumber,
              );
              if (!existing) {
                merged.push({
                  setNumber: f.set.setNumber,
                  reps: f.set.reps,
                  weightKg: f.set.weightKg,
                  durationSeconds: f.set.durationSeconds,
                  failed: true,
                  failedError: f.error,
                  clientId: f.set.clientId,
                });
              }
            }
            merged.sort((a, b) => a.setNumber - b.setNumber);
            return { ...ex, sets: merged };
          }),
        );
      }
    }

    // Set initial counts
    setPendingCount(outboxRef.current.pendingCount());
    setUnsavedCount(outboxRef.current.getFailed().length);

    // Flush on mount (in case we're resuming after a reconnect)
    void flush();

    // Flush on 'online' events
    const onOnline = () => {
      // S9: Clear offline state and reset retry count when coming back online
      retryAttemptsRef.current = 0;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      setSyncState({ type: "idle" });
      void flush();
    };
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, [userId, sessionId, flush, setExercises]);

  return {
    syncState,
    setSyncState,
    pendingCount,
    unsavedCount,
    flush,
    enqueue,
    remove,
    clear,
    isFlushing: () => outboxRef.current?.isFlushing() ?? false,
  };
}
