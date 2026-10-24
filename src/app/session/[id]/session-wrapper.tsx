"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SessionRunner, type RunnerExercise, type RunnerSettings } from "./session-runner";
import type { NextDayPlan } from "@/lib/program/day-plan";
import type { WarmupItem } from "@/lib/program/warmup";
import {
  readSessionSnapshot,
  writeSessionSnapshot,
  mergeSnapshotWithOutbox,
  type SessionSnapshot,
  type SessionCacheStorage,
} from "@/lib/session/session-cache";
import { isOffline } from "@/lib/session/offline-status";

const browserStorage: SessionCacheStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
};

type SessionData = {
  session: {
    id: string;
    status: string;
    warmupCompleted: boolean;
    startedAt: string | null;
    isDeload: boolean;
  };
  exercises: RunnerExercise[];
  elapsed: number;
  settings: RunnerSettings;
  warmups: WarmupItem[];
  nextDay: NextDayPlan | null;
  userId: string;
};

export function SessionWrapper(props: {
  data: SessionData | null;
  serverError?: string;
}) {
  const params = useParams();
  const sessionId = params.id as string;
  const [offline, setOffline] = useState(false);
  const [cachedData, setCachedData] = useState<SessionData | null>(null);

  // Detect offline status
  useEffect(() => {
    const updateOnlineStatus = () => {
      setOffline(isOffline(navigator.onLine));
    };
    
    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  // Try to load from cache if no server data
  useEffect(() => {
    if (!props.data && sessionId) {
      const snapshot = readSessionSnapshot(browserStorage, sessionId);
      if (snapshot) {
        // Convert snapshot to SessionData format
        const data: SessionData = {
          session: {
            id: snapshot.sessionId,
            status: "active",
            warmupCompleted: false,
            startedAt: null,
            isDeload: false,
          },
          exercises: snapshot.exercises.map((ex) => ({
            ...ex,
            cue: null,
            metric: "reps" as const,
            primaryMuscles: [],
            repsMin: 6,
            repsMax: 10,
            restSeconds: 180,
            workingWeightKg: null,
            suggestedWeightKg: null,
            status: "active" as const,
            feel: null,
            isBodyweight: false,
          })),
          elapsed: snapshot.elapsed,
          settings: {
            perSetLogging: true,
            restAutostart: false,
          },
          warmups: [],
          nextDay: null,
          userId: snapshot.userId,
        };
        setCachedData(data);
      }
    }
  }, [props.data, sessionId]);

  const dataToUse = props.data || cachedData;

  if (!dataToUse) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Loading session...</h1>
          {props.serverError && (
            <p className="mt-2 text-sm text-muted">{props.serverError}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {offline && (
        <div className="bg-yellow-100 border-b border-yellow-200 p-3 text-center text-sm text-yellow-900">
          Offline — sets will save when you're back
        </div>
      )}
      <SessionRunner
        session={dataToUse.session}
        exercises={dataToUse.exercises}
        elapsed={dataToUse.elapsed}
        settings={dataToUse.settings}
        warmups={dataToUse.warmups}
        nextDay={dataToUse.nextDay}
        userId={dataToUse.userId}
        onExercisesChange={(exercises) => {
          // Write snapshot after changes
          writeSessionSnapshot(browserStorage, {
            sessionId: dataToUse.session.id,
            userId: dataToUse.userId,
            exercises: exercises.map((ex) => ({
              id: ex.id,
              exerciseId: ex.exerciseId,
              name: ex.name,
              plannedSets: ex.plannedSets,
              sets: ex.sets,
            })),
            elapsed: dataToUse.elapsed,
          });
        }}
      />
    </>
  );
}
