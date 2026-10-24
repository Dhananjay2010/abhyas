/**
 * Pending set controller - pure logic for session expiry retry.
 * 
 * Extracted from React to be testable with typed fakes. The session-runner.tsx
 * component is a thin wrapper that wires DOM events to this controller and
 * renders from its state.
 */

import type { Result } from "@/app/session/actions";
import { isSessionExpired } from "./session-expired-shim";
import {
  isDuplicateError,
  loadPendingSets,
  savePendingSet,
  clearPendingSet,
  type PendingSet,
  type Storage,
} from "./pending-set-retry";

export type LogSetFunction = (input: {
  sessionExerciseId: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSeconds?: number | null;
}) => Promise<Result>;

export type PendingSetState = {
  pending: PendingSet[];
  expired: boolean;
  retrying: boolean;
  error: string | null;
};

export type SubmitResult =
  | { status: "saved" }
  | { status: "expired" }
  | { status: "failed"; error: string };

export type PendingSetController = {
  submit(set: {
    sessionExerciseId: string;
    setNumber: number;
    reps: number | null;
    weightKg: number | null;
    durationSeconds?: number | null;
    clientId: string;
  }): Promise<SubmitResult>;
  load(): void;
  replay(): Promise<void>;
  onFocus(): void;
  onAuthRestored(): void;
  getState(): PendingSetState;
};

export function createPendingSetController(config: {
  storage: Storage;
  logSet: LogSetFunction;
  sessionId: string;
  userId?: string;
  onChange: (state: PendingSetState) => void;
}): PendingSetController {
  const { storage, logSet, sessionId, onChange } = config;

  let state: PendingSetState = {
    pending: [],
    expired: false,
    retrying: false,
    error: null,
  };

  let replayPromise: Promise<void> | null = null;
  let replayAttempted = false;

  function setState(partial: Partial<PendingSetState>) {
    state = { ...state, ...partial };
    onChange(state);
  }

  function load(): void {
    const loaded = loadPendingSets(storage, sessionId);
    if (loaded.length > 0) {
      setState({
        pending: loaded,
        expired: true,
      });
    }
  }

  async function submit(set: {
    sessionExerciseId: string;
    setNumber: number;
    reps: number | null;
    weightKg: number | null;
    durationSeconds?: number | null;
    clientId: string;
  }): Promise<SubmitResult> {
    try {
      const result = await logSet({
        sessionExerciseId: set.sessionExerciseId,
        setNumber: set.setNumber,
        reps: set.reps,
        weightKg: set.weightKg,
        durationSeconds: set.durationSeconds,
      });

      if (result.ok) {
        return { status: "saved" };
      }

      if (isSessionExpired(result)) {
        const pending: PendingSet = {
          sessionExerciseId: set.sessionExerciseId,
          setNumber: set.setNumber,
          reps: set.reps,
          weightKg: set.weightKg,
          durationSeconds: set.durationSeconds ?? null,
          clientId: set.clientId,
        };
        savePendingSet(storage, sessionId, pending);

        const loaded = loadPendingSets(storage, sessionId);
        setState({
          pending: loaded,
          expired: true,
          error: null,
        });

        return { status: "expired" };
      }

      if (isDuplicateError(result)) {
        return { status: "saved" };
      }

      setState({ error: result.error ?? "Failed to save set" });
      return { status: "failed", error: result.error ?? "Failed to save set" };
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("SESSION_EXPIRED:")) {
        const pending: PendingSet = {
          sessionExerciseId: set.sessionExerciseId,
          setNumber: set.setNumber,
          reps: set.reps,
          weightKg: set.weightKg,
          durationSeconds: set.durationSeconds ?? null,
          clientId: set.clientId,
        };
        savePendingSet(storage, sessionId, pending);

        const loaded = loadPendingSets(storage, sessionId);
        setState({
          pending: loaded,
          expired: true,
          error: null,
        });

        return { status: "expired" };
      }

      const message = err instanceof Error ? err.message : "Network error";
      setState({ error: message });
      return { status: "failed", error: message };
    }
  }

  async function replay(): Promise<void> {
    if (replayPromise) {
      return replayPromise;
    }

    if (replayAttempted && state.pending.length === 0) {
      return;
    }

    replayPromise = (async () => {
      replayAttempted = true;

      const toReplay = loadPendingSets(storage, sessionId);
      if (toReplay.length === 0) {
        setState({
          pending: [],
          expired: false,
          retrying: false,
        });
        return;
      }

      setState({ retrying: true, error: null });

      let firstError: string | null = null;

      for (const set of toReplay) {
        try {
          const result = await logSet({
            sessionExerciseId: set.sessionExerciseId,
            setNumber: set.setNumber,
            reps: set.reps,
            weightKg: set.weightKg,
            durationSeconds: set.durationSeconds,
          });

          if (result.ok || isDuplicateError(result)) {
            clearPendingSet(storage, sessionId, set.clientId);
          } else if (isSessionExpired(result)) {
            if (!firstError) firstError = "Session still expired";
          } else {
            if (!firstError) firstError = result.error ?? "Failed to replay set";
          }
        } catch (err) {
          if (isDuplicateError(err)) {
            clearPendingSet(storage, sessionId, set.clientId);
          } else if (err instanceof Error && err.message.startsWith("SESSION_EXPIRED:")) {
            if (!firstError) firstError = "Session still expired";
          } else if (!firstError) {
            firstError = err instanceof Error ? err.message : "Network error";
          }
        }
      }

      const remaining = loadPendingSets(storage, sessionId);
      setState({
        pending: remaining,
        expired: remaining.length > 0,
        retrying: false,
        error: firstError,
      });
    })();

    await replayPromise;
    replayPromise = null;
  }

  function onFocus(): void {
    const loaded = loadPendingSets(storage, sessionId);
    if (loaded.length > 0 && !replayAttempted) {
      setState({
        pending: loaded,
        expired: true,
      });
      replay();
    }
  }

  function onAuthRestored(): void {
    const loaded = loadPendingSets(storage, sessionId);
    if (loaded.length > 0) {
      replay();
    }
  }

  function getState(): PendingSetState {
    return state;
  }

  load();

  return {
    submit,
    load,
    replay,
    onFocus,
    onAuthRestored,
    getState,
  };
}
