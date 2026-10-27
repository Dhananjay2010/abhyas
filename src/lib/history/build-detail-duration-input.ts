/**
 * Build input for computeDetailPageDuration from raw sets.
 * 
 * Extracts working sets (filters out warm-ups) for duration calculation.
 * This ensures the history detail page and list page use the same logic.
 */
export function buildDetailDurationInput(
  sets: Array<{
    completed_at: string | null;
    logged_at?: string | null;
    is_warmup_set: boolean;
  }>
): Array<{
  completed_at: string | null;
  logged_at?: string | null;
  is_warmup_set: boolean;
}> {
  return sets;
}
