"use client";

import { useState, useEffect, useRef } from "react";
import { branding } from "@/lib/branding";
import { determineRetryAction } from "@/lib/offline-retry-logic";

/**
 * Client-side retry button for the offline page.
 *
 * Shows "Still offline" feedback when retry is attempted while still offline.
 * Only reloads when the network is back (navigator.onLine and test fetch succeed).
 * Uses determineRetryAction to decide: reload current page vs navigate to ?url=.
 *
 * Timeout protection: if navigation doesn't happen within 4s, reset to idle state
 * and show "Still offline" (prevents button from getting stuck on "Checking…").
 * Timeout is cleared once navigation starts (ping succeeds), so slow 3G doesn't
 * flip to "Still offline" while the page loads.
 *
 * Falls back to a plain link for no-JS scenarios.
 */

const RETRY_TIMEOUT_MS = 4000;

export function OfflineRetry() {
  const [checking, setChecking] = useState(false);
  const [stillOffline, setStillOffline] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

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

  async function handleRetry() {
    if (!mountedRef.current) return;

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

    // Get URL param
    const params = new URLSearchParams(window.location.search);
    const urlParam = params.get("url");

    // Determine action using pure logic
    const action = determineRetryAction(online, fetchSucceeded, urlParam);

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

  const buttonStyle = {
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
      <button
        onClick={handleRetry}
        disabled={checking}
        style={buttonStyle}
      >
        {checking ? "Checking…" : "Retry"}
      </button>

      <p style={feedbackStyle} role="status" aria-live="polite">
        {stillOffline ? "Still offline" : "\u00A0"}
      </p>

      <noscript>
        {/* Fallback for no-JS: plain link that reloads */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" style={buttonStyle}>
          Retry
        </a>
      </noscript>
    </>
  );
}
