"use client";

import { useEffect } from "react";
import { cleanBannedExercises } from "./actions";

/**
 * Client component that triggers banned exercise cleanup after render.
 * Only runs when in-memory cleaning detected changes during SSR.
 */
export function CleanupTrigger({ shouldClean }: { shouldClean: boolean }) {
  useEffect(() => {
    if (shouldClean) {
      // Fire-and-forget: trigger cleanup but don't block render
      cleanBannedExercises().catch(console.error);
    }
  }, [shouldClean]);

  return null;
}
