/**
 * Determine whether to show the swap explanation on Today page.
 * 
 * The swap explanation ("You chose X for today...") only appears when:
 * - The day differs from the template (overrideExplains is true)
 * - AND the template actually exists (scheduled is not undefined)
 * 
 * @param overrideExplains - True when the override differs from template
 * @param scheduled - The template day (undefined when no program or off-cycle)
 * @returns True if the swap explanation should be shown
 */
export function shouldShowSwap(
  overrideExplains: boolean,
  scheduled: { id: string } | undefined
): boolean {
  return overrideExplains && scheduled !== undefined;
}
