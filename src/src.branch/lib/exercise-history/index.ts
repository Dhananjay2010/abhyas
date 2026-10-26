/**
 * Exercise history data layer for Abhyas.
 * 
 * Read-only helpers for querying a user's past performance on exercises.
 * Used by the session runner to show "last time" data and by History/Progress
 * pages to display trends and achievements.
 */

export {
  // Query functions
  getLastPerformance,
  getBatchLastPerformance,
  getExerciseHistory,
  
  // Types
  type LastPerformance,
  type ExerciseHistory,
  type ExerciseHistorySession,
  type ExerciseHistoryOptions,
} from "./queries";

export {
  // Pure calculation functions
  calculateSetVolume,
  findTopSet,
  detectPersonalRecords,
  
  // Types
  type SetData,
  type PersonalRecord,
  type PRType,
} from "./calculations";

// Re-export the shared e1RM helper from progression
export { computeE1rm } from "@/lib/program/progression";
