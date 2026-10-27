"use client";

import { useEffect, useState } from "react";
import { loadAllPendingSetsWithTimestamp, clearPendingSets, STALE_THRESHOLD_MS } from "@/lib/session/pending-set-retry";
import { createPendingSetDeps } from "@/lib/session/pending-set-deps";
import { attemptPendingSet } from "@/lib/session/pending-set-outcome";
import { logSet as defaultLogSet } from "@/app/session/actions";

/**
 * App-level replay component that runs once per signed-in user.
 * Attempts to replay all pending sets from any previous session.
 * 
 * For sets whose session is no longer in progress, shows "N sets couldn't be saved
 * because that workout ended" with a Discard button.
 * 
 * This ensures sets saved via "Sign out anyway" are replayed on next sign-in.
 */
export function PendingSetReplay({ 
  userId,
  getSessionStatus,
  logSet = defaultLogSet,
  now,
  storage,
}: { 
  userId: string;
  getSessionStatus?: (sessionId: string) => Promise<"in_progress" | "ended" | "stale">;
  logSet?: typeof defaultLogSet;
  now?: Date;
  storage?: Storage;
}) {
  const [hasReplayed, setHasReplayed] = useState(false);
  const [closedSessions, setClosedSessions] = useState<{ sessionId: string; count: number }[]>([]);

  useEffect(() => {
    // Reset replay state when userId changes
    setHasReplayed(false);
    setClosedSessions([]);
  }, [userId]);

  useEffect(() => {
    if (hasReplayed) return;

    async function replay() {
      const actualStorage = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
      if (!actualStorage) return;
      
      const deps = createPendingSetDeps(now);
      const all = loadAllPendingSetsWithTimestamp(actualStorage, userId, deps);
      
      const closedSessionsFound: { sessionId: string; count: number }[] = [];
      
      for (const sessionId in all) {
        const { sets, timestamp } = all[sessionId];
        if (sets.length === 0) continue;
        
        // Check if sets are expired (> 7 days old)
        const isExpired = deps.now() - timestamp > STALE_THRESHOLD_MS;
        
        // Check session status if available
        let status: "in_progress" | "ended" | "stale" | undefined;
        if (getSessionStatus && !isExpired) {
          try {
            status = await getSessionStatus(sessionId);
          } catch {
            // If we can't get status, assume in_progress and try replay
            status = "in_progress";
          }
        } else if (isExpired) {
          // Expired sets are treated as closed (ended)
          status = "ended";
        }
        
        // If session is not in progress, surface it for Discard
        if (status && status !== "in_progress") {
          closedSessionsFound.push({ sessionId, count: sets.length });
          continue;
        }
        
        // Try to replay each set
        for (const set of sets) {
          const outcome = await attemptPendingSet({
            set,
            userId,
            sessionId,
            storage: actualStorage,
            deps,
            logSet,
            sessionStatus: status,
          });
          
          // If outcome is "closed", add to surface list
          if (outcome.status === "closed") {
            const existing = closedSessionsFound.find(s => s.sessionId === sessionId);
            if (existing) {
              existing.count++;
            } else {
              closedSessionsFound.push({ sessionId, count: 1 });
            }
          }
        }
      }
      
      setClosedSessions(closedSessionsFound);
      setHasReplayed(true);
    }

    replay();
  }, [userId, hasReplayed, getSessionStatus, logSet, now, storage]);

  function handleDiscard(sessionId: string) {
    const actualStorage = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    if (!actualStorage) return;
    
    const deps = createPendingSetDeps(now);
    clearPendingSets(actualStorage, userId, sessionId, deps);
    
    setClosedSessions(prev => prev.filter(s => s.sessionId !== sessionId));
  }

  if (closedSessions.length === 0) return null;

  const totalSets = closedSessions.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50">
      <div className="rounded-xl border border-border bg-surface-2 p-4 shadow-lg">
        <p className="text-sm text-fg mb-3">
          {totalSets === 1
            ? "1 set couldn't be saved because that workout ended"
            : `${totalSets} sets couldn't be saved because those workouts ended`}
        </p>
        <button
          onClick={() => {
            closedSessions.forEach(s => handleDiscard(s.sessionId));
          }}
          className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-fg"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

