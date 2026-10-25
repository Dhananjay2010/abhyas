import { reconcileWithServer, type ResumeExercise } from "./resume-state";

export type ExercisesAction<T extends ResumeExercise> =
  | { type: "set"; exercises: T[] }
  | { type: "merge"; serverData: T[] }
  /**
   * A change computed from the state at the time it is applied, like a
   * functional `setState`. A save that resolves after a resume merge must add
   * its set to the merged list, not to the list from before the await.
   */
  | { type: "update"; update: (prev: T[]) => T[] };

export function exercisesReducer<T extends ResumeExercise>(
  state: T[],
  action: ExercisesAction<T>,
): T[] {
  if (action.type === "set") {
    return action.exercises;
  } else if (action.type === "update") {
    return action.update(state);
  } else {
    // Fresh server data over local state (B1 resume path): the server's list
    // and fields win, confirmed local sets are kept.
    return reconcileWithServer(state, action.serverData);
  }
}
