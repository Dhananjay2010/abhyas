/**
 * Valid practice types that can be stored in localStorage.
 */
export type PracticeType = "breathe" | "yoga";

/**
 * Determines which practice route to open when tapping the Practice tab.
 * 
 * @param currentPath - The current pathname
 * @param lastPractice - The last visited practice from localStorage (or null)
 * @returns "/breathe" or "/yoga"
 */
export function choosePracticeRoute(
  currentPath: string,
  lastPractice: PracticeType | null
): "/breathe" | "/yoga" {
  // If we're already on a yoga page, stay in yoga
  if (currentPath === "/yoga" || currentPath.startsWith("/yoga/")) {
    return "/yoga";
  }

  // If we're already on a breathe page, stay in breathe
  if (
    currentPath === "/breathe" ||
    currentPath.match(/^\/breathe\/(?:routine|journey)\/[^/]+$/) ||
    currentPath.match(/^\/breathe\/[^/]+$/)
  ) {
    return "/breathe";
  }

  // Otherwise, use the last visited practice, defaulting to breathe
  return lastPractice === "yoga" ? "/yoga" : "/breathe";
}

/**
 * Determines the active tab based on the current pathname.
 * Returns the href of the active tab, or null if no tab should be shown.
 */
export function activeTab(pathname: string): string | null {
  // Yoga and Breathe routes
  if (pathname === "/yoga" || pathname.startsWith("/yoga/")) {
    return "/practice";
  }
  if (
    pathname === "/breathe" ||
    pathname.match(/^\/breathe\/(?:routine|journey)\/[^/]+$/) ||
    pathname.match(/^\/breathe\/[^/]+$/)
  ) {
    return "/practice";
  }

  // Today route
  if (pathname === "/today") {
    return "/today";
  }

  // History routes
  if (pathname === "/history" || pathname.startsWith("/history/")) {
    return "/history";
  }

  // Progress route
  if (pathname === "/progress") {
    return "/progress";
  }

  // Settings route
  if (pathname === "/settings") {
    return "/settings";
  }

  // Dev harnesses
  if (pathname === "/dev/history") {
    return "/history";
  }
  if (pathname === "/dev/settings") {
    return "/settings";
  }
  if (pathname === "/dev/charts") {
    return "/progress";
  }
  if (
    pathname === "/dev/breathe" ||
    pathname.match(/^\/dev\/breathe\/(?:routine|journey)\/[^/]+$/) ||
    pathname.match(/^\/dev\/breathe\/[^/]+$/)
  ) {
    return "/practice";
  }
  if (pathname === "/dev/yoga") {
    return "/practice";
  }
  if (pathname === "/dev/loading-states") {
    return "/today";
  }

  // No tab active for other routes (session pages, onboarding, etc.)
  return null;
}
