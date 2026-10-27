"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signInAgainHref } from "@/lib/auth/session-expired";

/**
 * Prompt shown when a session has expired during a server action.
 * 
 * Shows an accessible alert with a link to sign in again, preserving the
 * current path as a next parameter for redirect after authentication.
 */
export function SessionExpiredPrompt() {
  const pathname = usePathname();
  const href = signInAgainHref(pathname);
  
  return (
    <div
      role="alert"
      data-testid="session-expired-prompt"
      className="rounded-xl border border-accent bg-accent/10 p-4 text-accent"
    >
      <p className="text-sm font-medium">Your session has expired, please sign in again</p>
      <Link
        href={href}
        className="mt-3 inline-flex min-h-[44px] items-center rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
      >
        Sign in
      </Link>
    </div>
  );
}

/**
 * Global session expiration manager.
 * 
 * Allows any component to trigger the session expired prompt once, even if
 * multiple actions fail simultaneously.
 */
let showPromptCallback: (() => void) | null = null;
let hasTriggered = false;

export function notifySessionExpired(): void {
  if (!hasTriggered && showPromptCallback) {
    hasTriggered = true;
    showPromptCallback();
  }
}

/**
 * Reset the global session expired state (for testing only).
 */
export function resetSessionExpiredState(): void {
  hasTriggered = false;
}

/**
 * Hook to mount the session expired prompt and register the global callback.
 * 
 * Usage: Place this in a top-level component (like settings page) to enable
 * session expiration detection.
 * 
 * @returns [promptElement, resetPrompt] - The prompt element to render and a
 *          function to reset the triggered state
 */
export function useSessionExpiredPrompt(): [React.ReactNode | null, () => void] {
  const [show, setShow] = useState(false);
  
  useEffect(() => {
    showPromptCallback = () => setShow(true);
    return () => {
      showPromptCallback = null;
    };
  }, []);
  
  const reset = () => {
    hasTriggered = false;
    setShow(false);
  };
  
  return [show ? <SessionExpiredPrompt /> : null, reset];
}
