import { mergeSets, type ExerciseWithSets } from "./merge-sets";

export type ExercisesAction<T extends ExerciseWithSets> =
  | { type: "set"; exercises: T[] }
  | { type: "merge"; serverData: T[] };

export function exercisesReducer<T extends ExerciseWithSets>(
  state: T[],
  action: ExercisesAction<T>,
): T[] {
  if (action.type === "set") {
    return action.exercises;
  } else {
    // Merge server data with current local state (Case B: resume path)
    return mergeSets(state, action.serverData);
  }
}
