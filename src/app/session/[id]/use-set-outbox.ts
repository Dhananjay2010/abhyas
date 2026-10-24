import { useEffect, useRef, useState } from "react";
import {
  Outbox,
  createLocalStorage,
  mergePendingSets,
  classifyLogSetOutcome,
  type OutboxSender,
} from "@/lib/session/outbox";
import * as actions from "../actions";

type SyncState =
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
  sessionId: string,
  setExercises: React.Dispatch<React.SetStateAction<T[]>>,
) {
  const outboxRef = useRef<Outbox | null>(null);
  const [syncState, setSyncState] = useState<SyncState>({ type: "idle" });
  const [pendingCount, setPendingCount] = useState(0);
  const [unsavedCount, setUnsavedCount] = useState(0);

  const flush = async () => {
    const outbox = outboxRef.current;
    if (!outbox || outbox.pendingCount() === 0 || outbox.isFlushing()) return;

    setSyncState({ type: "syncing" });

    try {
      const result = await outbox.flush();

      // If skipped (in-flight lock), leave status unchanged
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
        // All sets synced
        setSyncState({ type: "idle" });
      } else if (result.stopped) {
        setSyncState({ type: "failed", message: "Sync failed, will retry" });
      } else {
        setSyncState({ type: "idle" });
      }
    } catch (err) {
      setSyncState({
        type: "failed",
        message:
          err instanceof Error ? err.message : "Sync failed, will retry",
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
          // Reuse classifyLogSetOutcome: 'invalid' is permanent
          return {
            ok: false,
            permanent: classification.outcome === "invalid",
            error: classification.error ?? "Failed to save set",
          };
        } catch (thrown) {
          // Network errors or thrown errors are transient
          const classification = classifyLogSetOutcome({ thrown });
          return {
            ok: false,
            permanent: false,
            error: classification.error ?? "Network error",
          };
        }
      },
    };

    const storage = createLocalStorage(`outbox:${sessionId}`);
    outboxRef.current = new Outbox(storage, sender, `outbox:${sessionId}`);

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
      // Clear offline state when coming back online
      setSyncState({ type: "idle" });
      void flush();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
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
