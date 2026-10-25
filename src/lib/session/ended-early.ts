/**
 * Determine if a completed session was ended early.
 * 
 * A completed strength session counts as ended early when:
 * 1. At least one exercise is still 'pending' AND logged working sets < planned, OR
 * 2. It has 0 working sets (no exercises or all pending with 0 sets)
 * 
 * Extracted from History page logic and used in both History and Today pages
 * to ensure consistent behavior across the app.
 */

export function isEndedEarly(params: {
  isStrength: boolean;
  status: string | null;
  hasPendingExercise: boolean;
  plannedSets: number | undefined;
  workingSetCount: number;
  hasNoExercises: boolean;
}): boolean {
  const { isStrength, status, hasPendingExercise, plannedSets, workingSetCount, hasNoExercises } = params;
  
  // Only applies to completed strength sessions
  if (!isStrength || status !== "completed") {
    return false;
  }
  
  // First branch: pending exercise with incomplete sets
  const incompletePendingExercise = 
    hasPendingExercise && 
    plannedSets !== undefined && 
    plannedSets > 0 && 
    workingSetCount < plannedSets;
  
  // Second branch: 0 working sets (no exercises or all pending with 0 sets)
  const zeroWorkingSets = 
    workingSetCount === 0 && 
    (hasPendingExercise || hasNoExercises);
  
  return incompletePendingExercise || zeroWorkingSets;
}
