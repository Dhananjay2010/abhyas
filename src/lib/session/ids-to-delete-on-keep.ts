import type { Database } from "@/lib/database.types";

type SessionRow = {
  id: string;
  actual_type: Database["public"]["Enums"]["day_type"] | null;
};

/**
 * Return the IDs of planned sessions that should be deleted when the user chooses "Keep it".
 *
 * On a Rest override day, "Keep it" means keep the Rest override, not delete it.
 * If all planned sessions are Rest, return an empty array (nothing to delete).
 * Otherwise, delete all planned sessions to revert to the template.
 */
export function idsToDeleteOnKeep(planned: SessionRow[]): string[] {
  if (planned.length === 0) {
    return [];
  }

  const allRest = planned.every((s) => s.actual_type === "rest");
  if (allRest) {
    return [];
  }

  return planned.map((s) => s.id);
}
