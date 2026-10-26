/**
 * Core logic for planDay's "keep" action.
 *
 * When the user chooses "Keep it" on a day plan prompt:
 * - Keep whatever planned choice exists (training, yoga, breathing, or rest).
 * - "Keep it" is a no-op for any override - the user explicitly wants to keep
 *   what they chose.
 *
 * Returns an empty deletedIds array (nothing was deleted).
 */
export async function keepPlannedDay(): Promise<{
  ok: true;
  deletedIds: string[];
} | { ok: false; error: string }> {
  // "Keep it" always keeps: training override, yoga override, breathing override, or Rest override
  return { ok: true, deletedIds: [] };
}
