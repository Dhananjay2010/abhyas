/**
 * Decision function for set logging: determines whether to insert, accept as
 * duplicate, or reject as conflict.
 *
 * Pure function with no side effects, suitable for unit testing.
 */

export type SetWriteInput = {
  reps: number | null;
  weightKg: number | null;
  durationSeconds: number | null;
};

export type ExistingSet = {
  reps: number | null;
  weight_kg: number | null;
  duration_seconds: number | null;
};

export type SetWriteDecision = "insert" | "duplicate_ok" | "conflict";

/**
 * Decide whether to insert a set, accept it as a duplicate, or reject it as a conflict.
 *
 * - `insert`: no existing set, proceed with insert
 * - `duplicate_ok`: existing set has identical values (idempotent replay)
 * - `conflict`: existing set exists with different values (stale client)
 *
 * @param existingRow - The existing set from the database, or null if none exists
 * @param incoming - The set values the client wants to log
 * @returns The decision: 'insert' | 'duplicate_ok' | 'conflict'
 */
export function decideSetWrite(
  existingRow: ExistingSet | null,
  incoming: SetWriteInput,
): SetWriteDecision {
  if (!existingRow) {
    return "insert";
  }

  // Idempotency: if the values match exactly, accept as a duplicate
  // (offline outbox may replay the same set)
  const repsMatch = existingRow.reps === incoming.reps;
  const weightMatch = 
    (existingRow.weight_kg === null && incoming.weightKg === null) ||
    (existingRow.weight_kg !== null &&
      incoming.weightKg !== null &&
      Number(existingRow.weight_kg) === incoming.weightKg);
  const durationMatch =
    existingRow.duration_seconds === incoming.durationSeconds;

  if (repsMatch && weightMatch && durationMatch) {
    return "duplicate_ok";
  }

  return "conflict";
}
