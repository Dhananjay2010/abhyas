import { safeNextPath } from "@/lib/safe-next-path";

/**
 * Session expired error code.
 * 
 * When a server action is invoked with an expired session, the proxy returns
 * 401 with this code in the response. Next.js 16's action client throws an
 * Error with the response text as the message.
 */
export const SESSION_EXPIRED_CODE = 'SESSION_EXPIRED';

/**
 * Check if an error or response indicates a session expiration.
 * 
 * Next.js 16's fetchServerAction (in server-action-reducer.js) handles 401
 * responses by checking if the response is an RSC response or has a redirect
 * header. When neither is present and status >= 400:
 * - If content-type is text/plain, it throws Error(await res.text())
 * - Otherwise, it throws Error("An unexpected response was received from the server.")
 * 
 * Since JSON responses cannot be parsed by the action client, the proxy returns
 * text/plain with a detectable prefix "SESSION_EXPIRED:" that this function
 * can reliably identify.
 * 
 * @param errOrResponse - An Error thrown by a server action, a Response object,
 *                        or an action Result object
 * @returns true if the error indicates session expiration
 */
export function isSessionExpired(errOrResponse: unknown): boolean {
  // Check if it's an Error with our message prefix
  if (errOrResponse instanceof Error) {
    return errOrResponse.message.startsWith(SESSION_EXPIRED_CODE + ':');
  }
  
  // Check if it's a Response with 401 status
  if (errOrResponse instanceof Response) {
    return errOrResponse.status === 401;
  }
  
  // Check if it's a Result object with our code
  if (
    errOrResponse &&
    typeof errOrResponse === 'object' &&
    'ok' in errOrResponse &&
    errOrResponse.ok === false &&
    'code' in errOrResponse &&
    errOrResponse.code === SESSION_EXPIRED_CODE
  ) {
    return true;
  }
  
  return false;
}

/**
 * Build a sign-in redirect URL with a next parameter.
 * 
 * @param nextPath - The path to redirect to after sign-in
 * @returns Sign-in URL with safe next parameter, or just "/" if path is invalid
 */
export function signInAgainHref(nextPath: string): string {
  const safePath = safeNextPath(nextPath, '/today');
  
  // If the path is the default fallback or empty, just go to sign-in
  if (safePath === '/today' && nextPath !== '/today') {
    return '/';
  }
  
  // Otherwise, include the next parameter
  return `/?next=${encodeURIComponent(safePath)}`;
}
