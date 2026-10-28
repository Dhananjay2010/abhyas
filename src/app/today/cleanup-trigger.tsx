"use client";

import { useEffect } from "react";
import { cleanBannedExercises } from "./actions";
import { fireBannedCleanupIfNeeded } from "@/lib/today/banned-cleanup-action";

/**
 * Client component that triggers banned exercise cleanup after render.
 * Only runs when in-memory cleaning detected changes during SSR.
 */
export function CleanupTrigger({ shouldClean }: { shouldClean: boolean }) {
  useEffect(() => {
    // Fire-and-forget: trigger cleanup but don't block render
    fireBannedCleanupIfNeeded(shouldClean, cleanBannedExercises, console.error);
  }, [shouldClean]);

  return null;
}
