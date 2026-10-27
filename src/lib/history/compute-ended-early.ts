/**
 * Compute whether a session ended early based on History rules.
 * 
 * Matches src/app/history/page.tsx:226-232 logic.
 */
export function computeHistoryEndedEarly(params: {
  hasPendingExercise: boolean;
  plannedSets: number | undefined;
  workingSetCount: number;
  isStrength: boolean;
  status: string;
  hasNoExercises: boolean;
}): boolean {
  const { hasPendingExercise, plannedSets, workingSetCount, isStrength, status, hasNoExercises } = params;
  
  return (
    (hasPendingExercise && 
     plannedSets !== undefined && 
     plannedSets > 0 && 
     workingSetCount < plannedSets) ||
    (isStrength && status === "completed" && workingSetCount === 0 && (hasPendingExercise || hasNoExercises))
  );
}
