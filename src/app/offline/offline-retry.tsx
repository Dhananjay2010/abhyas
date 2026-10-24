"use client";

import { useState } from "react";
import { branding } from "@/lib/branding";

/**
 * Client-side retry button for the offline page.
 *
 * Shows "Still offline" feedback when retry is attempted while still offline.
 * Only reloads when the network is back (navigator.onLine and test fetch succeed).
 *
 * Falls back to a plain link for no-JS scenarios.
 */
export function OfflineRetry() {
  const [checking, setChecking] = useState(false);
  const [stillOffline, setStillOffline] = useState(false);

  async function handleRetry() {
    setChecking(true);
    setStillOffline(false);

    // Quick check: navigator.onLine
    if (!navigator.onLine) {
      setChecking(false);
      setStillOffline(true);
      return;
    }

    // Confirm with a test fetch (navigator.onLine can lie)
    try {
      const response = await fetch("/favicon.ico", {
        method: "HEAD",
        cache: "no-store",
      });
      if (response.ok) {
        // Back online: reload
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/";
      } else {
        // Fetch succeeded but returned error (unlikely, but handle it)
        setChecking(false);
        setStillOffline(true);
      }
    } catch {
      // Fetch failed: still offline
      setChecking(false);
      setStillOffline(true);
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

      {stillOffline && (
        <p style={feedbackStyle} role="status" aria-live="polite">
          Still offline
        </p>
      )}

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
