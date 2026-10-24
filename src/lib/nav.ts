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
  if (pathname === "/dev/yoga" || pathname === "/dev/loading-states") {
    return "/today";
  }

  // No tab active for other routes (session pages, onboarding, etc.)
  return null;
}
