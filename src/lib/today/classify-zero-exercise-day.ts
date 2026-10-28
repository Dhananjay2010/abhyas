/**
 * Determines if a day becomes a rest day after cleanup removes all exercises.
 * 
 * When a weights/bodyweight day loses all exercises (e.g. current-knee injury
 * bans all planned movements and no alternatives exist), the day becomes rest.
 * 
 * Item 5 mutant: day_type unchanged - zero-exercise days remain "weights".
 */
export function isRestAfterCleanup(
  originalDayType: string,
  cleanedExercises: unknown[]
): boolean {
  const isTrainingDay = originalDayType === "weights" || originalDayType === "bodyweight";
  return isTrainingDay && cleanedExercises.length === 0;
}
