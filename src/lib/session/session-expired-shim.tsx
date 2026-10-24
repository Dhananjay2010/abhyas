/**
 * Session expiry detection shim.
 * 
 * Minimal local stub for session-expired functionality.
 */

import { safeNextPath } from "@/lib/safe-next-path";

export const SESSION_EXPIRED_CODE = 'SESSION_EXPIRED';

/**
 * Check if an error indicates session expiration (401 or auth error).
 */
export function isSessionExpired(errOrResponse: unknown): boolean {
  if (
    errOrResponse &&
    typeof errOrResponse === 'object' &&
    'ok' in errOrResponse &&
    errOrResponse.ok === false
  ) {
    const err = errOrResponse as { ok: false; error?: string; code?: string };
    if (err.code === SESSION_EXPIRED_CODE) return true;
  }
  
  if (errOrResponse instanceof Error) {
    const message = errOrResponse.message;
    return message.startsWith(SESSION_EXPIRED_CODE + ':');
  }
  
  if (errOrResponse instanceof Response) {
    return errOrResponse.status === 401;
  }
  
  return false;
}

/**
 * Check if an error indicates session expiration (401 or auth error).
 */
export function isSessionExpired(errOrResponse: unknown): boolean {
  if (
    errOrResponse &&
    typeof errOrResponse === 'object' &&
    'ok' in errOrResponse &&
    errOrResponse.ok === false
  ) {
    const err = errOrResponse as { ok: false; error?: string; code?: string };
    if (err.code === SESSION_EXPIRED_CODE) return true;
  }
  
  if (errOrResponse instanceof Error) {
    const message = errOrResponse.message;
    return message.startsWith(SESSION_EXPIRED_CODE + ':');
  }
  
  if (errOrResponse instanceof Response) {
    return errOrResponse.status === 401;
  }
  
  return false;
}

/**
 * Build a sign-in redirect URL with next parameter.
 */
export function signInAgainHref(nextPath: string): string {
  const safePath = safeNextPath(nextPath);
  return `/?next=${encodeURIComponent(safePath)}`;
}

let sessionExpiredState = false;

/**
 * Session expired prompt component (minimal implementation).
 * Uses window.location.pathname to build the sign-in redirect URL.
 */
export function SessionExpiredPrompt() {
  const href = typeof window !== 'undefined' 
    ? signInAgainHref(window.location.pathname)
    : '/?next=%2Ftoday';

  return (
    <div
      role="alert"
      data-testid="session-expired-prompt"
      className="mt-4 rounded-xl border border-accent bg-accent/10 p-4 text-accent"
    >
      <p className="text-sm font-medium">Your session expired. Sign in again to save your work.</p>
      <a
        href={href}
        className="mt-3 inline-flex min-h-[44px] items-center rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
      >
        Sign in
      </a>
    </div>
  );
}
