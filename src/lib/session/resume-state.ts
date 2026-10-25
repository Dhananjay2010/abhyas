import { mergeSets, type SetForMerge } from "./merge-sets";

/**
 * What the runner needs to know about an exercise to decide where a resumed
 * session stands. Generic so the runner's own exercise type flows through.
 */
export type ResumeExercise = {
  /** The session_exercise id: what a logged set is saved under. */
  id: string;
  status: "pending" | "completed" | "skipped" | "swapped_out";
  plannedSets: number;
  sets: SetForMerge[];
  /** completed_at of this exercise's most recent working set, from the DB. */
  lastLoggedAt?: string | null;
};

/*
  B1, the stale resume.

  The client router cache (`staleTimes.dynamic` in next.config.ts) can hand a
  soft navigation back into /session/[id] the RSC payload from the runner's
  FIRST load, because logging a set, swapping or finishing an exercise
  revalidates nothing on that route. The runner remounts, `useState` seeds
  itself from those props, and the user is back on exercise one with the old
  sets and the pre-swap exercise, saving the next sets under the wrong
  session_exercise. The functions below are how the runner gets back to what
  the database says: the list, its order and every field come from the server,
  the current exercise is the one the latest logged set belongs to, and a set
  is numbered from the exercise on screen.
*/

/**
 * The exercise a session should open on: the pending one holding the most
 * recently logged set (the one the user was in the middle of), otherwise the
 * first pending one. 0 when nothing is pending.
 */
export function pickCurrentExerciseIndex<T extends ResumeExercise>(exercises: T[]): number {
  let latest = -1;
  let latestAt = "";
  exercises.forEach((e, i) => {
    if (e.status !== "pending" || !e.lastLoggedAt) return;
    if (latest === -1 || e.lastLoggedAt > latestAt) {
      latest = i;
      latestAt = e.lastLoggedAt;
    }
  });
  if (latest !== -1) return latest;
  return Math.max(0, exercises.findIndex((e) => e.status === "pending"));
}

/**
 * Fresh server data over what the runner holds.
 *
 * The server's list wins: its order, its membership and every field of each
 * exercise, so a swap made before leaving is still there and the swapped-out
 * exercise does not come back. Sets are merged per exercise, so a save the
 * client has confirmed but the payload predates is not dropped.
 */
export function reconcileWithServer<T extends ResumeExercise>(local: T[], server: T[]): T[] {
  return server.map((serverEx) => {
    const localEx = local.find((e) => e.id === serverEx.id);
    return localEx ? mergeSets([localEx], [serverEx])[0] : serverEx;
  });
}

/**
 * Where the next set for the exercise on screen goes: that exercise's id and
 * the number after its last set. Null when it is not there or not pending, so
 * a tap left over from a screen that has since changed saves nothing.
 * 
 * Counts BOTH confirmed and pending sets to avoid set number collisions during replay.
 */
export function nextSetTarget<T extends ResumeExercise>(
  exercises: T[],
  displayedExerciseId: string,
  pendingSets?: Array<{ sessionExerciseId: string; setNumber: number }>,
): { sessionExerciseId: string; setNumber: number } | null {
  const exercise = exercises.find((e) => e.id === displayedExerciseId);
  if (!exercise || exercise.status !== "pending") return null;
  
  // Find the highest set number from confirmed sets and pending sets for THIS exercise
  const highest = Math.max(
    0,
    ...exercise.sets.map((s) => s.setNumber),
    ...(pendingSets ?? [])
      .filter((p) => p.sessionExerciseId === exercise.id)
      .map((p) => p.setNumber),
  );
  
  return { sessionExerciseId: exercise.id, setNumber: highest + 1 };
}
