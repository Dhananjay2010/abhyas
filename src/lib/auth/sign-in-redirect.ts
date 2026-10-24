/**
 * Build the search string for sign-in redirects from the proxy.
 * 
 * Returns ?next=<encoded-path> for protected GET requests, or empty string for:
 * - Root path (/)
 * - API routes (/api/*)
 * - Non-GET requests
 * 
 * @param pathname - The request pathname
 * @param search - The request search string (including leading ?)
 * @param method - The HTTP method
 * @returns The search string to use for the redirect (empty or ?next=...)
 */
export function buildSignInRedirectSearch(
  pathname: string,
  search: string,
  method: string
): string {
  // Don't add ?next for root path, /api/*, or non-GET requests
  const shouldAddNext = 
    pathname !== '/' &&
    !pathname.startsWith('/api/') &&
    method === 'GET';
  
  if (!shouldAddNext) {
    return '';
  }
  
  const originalPath = pathname + search;
  return `?next=${encodeURIComponent(originalPath)}`;
}

/**
 * Determine the redirect target for a signed-in user on the landing page.
 * 
 * Rules:
 * - If onboarding not complete: always go to /onboarding (ignore next)
 * - If onboarding complete and next provided: validate and use safe next path
 * - If onboarding complete and no next: go to /today
 * 
 * @param onboardingCompletedAt - ISO timestamp or null if not completed
 * @param next - The next parameter from query string
 * @param safeNextPath - Function to validate and sanitize next paths
 * @returns The path to redirect to
 */
export function getLandingRedirectTarget(
  onboardingCompletedAt: string | null | undefined,
  next: string | null | undefined,
  safeNextPath: (next: string | null | undefined) => string
): string {
  // Onboarding not complete: always go to /onboarding (don't skip with next)
  if (!onboardingCompletedAt) {
    return '/onboarding';
  }
  
  // Onboarding complete: use next if present, otherwise /today
  if (next) {
    return safeNextPath(next);
  }
  
  return '/today';
}

/**
 * Build the OAuth redirect URL for sign-in, optionally including next parameter.
 * 
 * @param origin - The window.location.origin
 * @param next - The next parameter to carry through sign-in (may be unsafe)
 * @param safeNextPath - Function to validate and sanitize next paths
 * @returns The full redirect URL for OAuth
 */
export function buildOAuthRedirectUrl(
  origin: string,
  next: string | null | undefined,
  safeNextPath: (next: string | null | undefined, fallback: string) => string
): string {
  const base = `${origin}/auth/callback`;
  
  // Validate next on the client to avoid sending malicious values to the server
  const safe = next ? safeNextPath(next, '') : '';
  
  if (safe) {
    return `${base}?next=${encodeURIComponent(safe)}`;
  }
  
  return base;
}
