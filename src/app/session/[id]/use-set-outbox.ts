import { useEffect, useRef, useState } from "react";
import {
  Outbox,
  createLocalStorage,
  mergePendingSets,
  classifyLogSetOutcome,
  type OutboxSender,
} from "@/lib/session/outbox";
import { getRetryDelay, mapErrorToUserMessage } from "@/lib/session/error-messages";
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

  const flush = async () => {
    const outbox = outboxRef.current;
    if (!outbox || outbox.pendingCount() === 0 || outbox.isFlushing()) return;

    // S9: Check if offline - don't count attempt, show "Waiting for connection"
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
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
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { pending: _p, clientId: _c, ...rest } = s;
                  return rest;
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
        const delay = getRetryDelay(retryAttemptsRef.current);
        setSyncState({ type: "failed", message: "Couldn't sync yet, retrying" });
        
        // Schedule retry
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
        }
        retryTimerRef.current = setTimeout(() => {
          flush();
        }, delay);
      } else {
        setSyncState({ type: "idle" });
      }
    } catch (err) {
      // Map quota and other errors to user-friendly text
      const rawMessage = err instanceof Error ? err.message : "Sync failed, will retry";
      const mappedMessage = mapErrorToUserMessage(undefined, rawMessage);
      setSyncState({
        type: "failed",
        message: mappedMessage,
      });
    }
  };

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
          const classification = classifyLogSetOutcome(result);
          if (classification.outcome === "saved") {
            return { ok: true };
          }
          // Map error using postgresCode if available
          const postgresCode = (!result.ok && result.data && "postgresCode" in result.data) 
            ? (result.data.postgresCode as string | undefined)
            : undefined;
          const mappedError = mapErrorToUserMessage(postgresCode, classification.error);
          
          return {
            ok: false,
            permanent: classification.outcome === "invalid",
            error: mappedError,
          };
        } catch (thrown) {
          // Network errors or thrown errors are transient
          const classification = classifyLogSetOutcome({ thrown });
          const mappedError = mapErrorToUserMessage(undefined, classification.error);
          return {
            ok: false,
            permanent: false,
            error: mappedError,
            network: classification.isNetwork,
          };
        }
      },
    };

    const storageKey = `abhyas:outbox:${userId}:${sessionId}`;
    const storage = createLocalStorage(storageKey);
    outboxRef.current = new Outbox(storage, sender, storageKey);

    // Clean up old key formats if they exist
    try {
      const oldKey1 = `outbox:${sessionId}`;
      const oldKey2 = `abhyas:outbox:${sessionId}`;
      if (localStorage.getItem(oldKey1)) localStorage.removeItem(oldKey1);
      if (localStorage.getItem(oldKey2)) localStorage.removeItem(oldKey2);
    } catch {
      // Ignore storage errors
    }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

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
