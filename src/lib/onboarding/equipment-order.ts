/**
 * Equipment ordering helpers for onboarding.
 * For home users, bodyweight equipment must appear first.
 */

/**
 * Reorder equipment categories to show bodyweight first for home users.
 * This ensures "Bodyweight (no equipment)" is always visible without scrolling.
 *
 * @param categories - Available equipment categories
 * @param location - Training location ("gym" or "home")
 * @returns Ordered category list with bodyweight first for home users
 */
export function orderEquipmentCategories(
  categories: string[],
  location: "gym" | "home" | null
): string[] {
  if (location === "home" && categories.includes("bodyweight")) {
    return ["bodyweight", ...categories.filter((k) => k !== "bodyweight")];
  }
  return categories;
}
