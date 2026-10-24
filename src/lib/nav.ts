/**
 * Valid practice types that can be stored in localStorage.
 */
export type PracticeType = "breathe" | "yoga";

/**
 * Custom event name for practice:last changes.
 * Dispatched when setLastPractice writes to localStorage, so the Practice tab
 * can update immediately in the same tab (storage events don't fire locally).
 */
export const PRACTICE_LAST_CHANGE_EVENT = "practice:last-change";

/**
 * Writes the last practice type to localStorage and dispatches a custom event
 * so the bottom nav can update immediately (storage events don't fire in the
 * writing tab).
 * 
 * @param value - The practice type to store
 */
export function setLastPractice(value: PracticeType): void {
  try {
    localStorage.setItem("practice:last", value);
    window.dispatchEvent(new Event(PRACTICE_LAST_CHANGE_EVENT));
  } catch {
    // localStorage may be unavailable (private mode, quota exceeded)
  }
}

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

/**
 * Check if a pathname needs bottom nav on its 404 page.
 * True when activeTab returns null (no tab would show on valid page).
 * 
 * @param pathname - The current pathname
 * @returns true if this path needs nav on 404, false otherwise
 */
export function needsNotFoundNav(pathname: string): boolean {
  return activeTab(pathname) === null;
}
