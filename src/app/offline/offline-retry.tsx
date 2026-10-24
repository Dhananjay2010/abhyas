"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { branding } from "@/lib/branding";
import { determineRetryAction } from "@/lib/offline-retry-logic";
import { safeNextPath } from "@/lib/safe-next-path";

/**
 * Client-side retry button for the offline page.
 *
 * Renders as a plain <a href> that works without JS, enhanced with client-side
 * feedback when JS is available.
 *
 * With JS: Shows "Still offline" feedback when retry is attempted while still offline.
 * Only reloads when the network is back (navigator.onLine and test fetch succeed).
 * Uses determineRetryAction to decide: reload current page vs navigate to ?url=.
 *
 * Without JS: The link always works as a full navigation to the sanitized target URL.
 *
 * Timeout protection: if navigation doesn't happen within 4s, reset to idle state
 * and show "Still offline" (prevents button from getting stuck on "Checking…").
 * Timeout is cleared once navigation starts (ping succeeds), so slow 3G doesn't
 * flip to "Still offline" while the page loads.
 */

const RETRY_TIMEOUT_MS = 4000;

/**
 * Get the retry target URL from the current location.
 * Returns the sanitized ?url= parameter, or "/" if none or if on /offline.
 */
function getRetryHref(): string {
  if (typeof window === "undefined") return "/";
  
  const params = new URLSearchParams(window.location.search);
  const urlParam = params.get("url");
  
  if (urlParam) {
    return safeNextPath(urlParam, "/");
  }
  
  // No url param: if we're on /offline, go home instead of reloading /offline
  if (window.location.pathname === "/offline") {
    return "/";
  }
  
  // Otherwise reload current page (same href)
  return window.location.pathname + window.location.search;
}

export function OfflineRetry() {
  const [checking, setChecking] = useState(false);
  const [stillOffline, setStillOffline] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  
  // Compute retry href once on mount (client-side only)
  const retryHref = useMemo(() => getRetryHref(), []);

  useEffect(() => {
    mountedRef.current = true;
    
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  async function handleRetry(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!mountedRef.current) return;
    
    // Prevent default navigation - we'll handle it ourselves with connectivity check
    e.preventDefault();

    setChecking(true);
    setStillOffline(false);

    // Safety timeout: if navigation doesn't happen, reset button after 4s
    timeoutRef.current = window.setTimeout(() => {
      if (mountedRef.current) {
        setChecking(false);
        setStillOffline(true);
      }
    }, RETRY_TIMEOUT_MS);

    // Quick check: navigator.onLine
    const online = navigator.onLine;

    // Confirm with a test fetch (navigator.onLine can lie)
    let fetchSucceeded = false;
    if (online) {
      try {
        const response = await fetch("/favicon.ico", {
          method: "HEAD",
          cache: "no-store",
        });
        fetchSucceeded = response.ok;
      } catch {
        fetchSucceeded = false;
      }
    }

    // Get URL param and current path
    const params = new URLSearchParams(window.location.search);
    const urlParam = params.get("url");
    const currentPath = window.location.pathname;

    // Determine action using pure logic
    const action = determineRetryAction(online, fetchSucceeded, urlParam, currentPath);

    if (action.type === "still-offline") {
      // Clear timeout and show "Still offline"
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (mountedRef.current) {
        setChecking(false);
        setStillOffline(true);
      }
    } else {
      // Clear timeout once navigation starts (so slow 3G doesn't flip to "Still offline")
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // Navigate or reload
      if (action.type === "navigate") {
        window.location.href = action.url;
      } else {
        window.location.reload();
      }
      // Navigation initiated; component will unmount
    }
  }

  const linkStyle = {
    display: "inline-block",
    padding: "0.875rem 2rem",
    fontSize: "1rem",
    fontWeight: 500,
    borderRadius: "0.5rem",
    backgroundColor: branding.colors.accent,
    color: branding.colors.accentFg,
    textDecoration: "none",
    border: "none",
    cursor: "pointer",
    transition: "opacity 0.2s",
    minHeight: "44px",
    minWidth: "44px",
    textAlign: "center" as const,
  };

  const feedbackStyle = {
    marginTop: "1rem",
    fontSize: "0.875rem",
    color: branding.colors.muted,
    minHeight: "1.25rem",
    visibility: stillOffline ? ("visible" as const) : ("hidden" as const),
  };

  return (
    <>
      <a
        href={retryHref}
        onClick={handleRetry}
        style={{
          ...linkStyle,
          opacity: checking ? 0.6 : 1,
          pointerEvents: checking ? ("none" as const) : ("auto" as const),
        }}
      >
        {checking ? "Checking…" : "Retry"}
      </a>

      <p style={feedbackStyle} role="status" aria-live="polite">
        {stillOffline ? "Still offline" : "\u00A0"}
      </p>
    </>
  );
}
