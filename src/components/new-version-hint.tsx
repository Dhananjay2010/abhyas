"use client";

import { useEffect, useState } from "react";
import { branding } from "@/lib/branding";

/**
 * New version notification.
 *
 * Listens for service worker updates (new build deployed) and shows
 * a small branded "New version – tap to refresh" hint.
 *
 * NEVER auto-reloads. Especially not during a session.
 *
 * Uses colors from branding config.
 */
export function NewVersionHint() {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Listen for SW updates
    async function checkForUpdates() {
      const registration = await navigator.serviceWorker.ready;
      
      // New SW found during update check
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            // New version available (old SW still controlling)
            setShowHint(true);
          }
        });
      });

      // Controller changed (new SW took over)
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        // Only show hint if we didn't trigger the reload ourselves
        const win = window as Window & { __reloadingForNewVersion?: boolean };
        if (!win.__reloadingForNewVersion) {
          setShowHint(true);
        }
      });

      // Check for updates now
      registration.update().catch(() => {
        // Ignore update check errors
      });
    }

    checkForUpdates();

    // Periodic update check (every 5 minutes)
    const interval = setInterval(() => {
      navigator.serviceWorker.ready.then((registration) => {
        registration.update().catch(() => {
          // Ignore update check errors
        });
      });
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  function handleRefresh() {
    // Mark that we're reloading intentionally
    if (typeof window !== "undefined") {
      (window as Window & { __reloadingForNewVersion?: boolean }).__reloadingForNewVersion = true;
    }
    window.location.reload();
  }

  if (!showHint) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "env(safe-area-inset-top, 0)",
        left: 0,
        right: 0,
        padding: "0.75rem 1rem",
        background: branding.colors.accent,
        color: branding.colors.accentFg,
        fontSize: "0.875rem",
        fontWeight: 500,
        textAlign: "center",
        zIndex: 9999,
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
      }}
    >
      New version – tap to refresh
      <button
        onClick={handleRefresh}
        style={{
          marginLeft: "0.75rem",
          padding: "0.25rem 0.75rem",
          background: branding.colors.accentFg,
          color: branding.colors.accent,
          border: "none",
          borderRadius: "0.25rem",
          fontSize: "0.875rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Refresh
      </button>
    </div>
  );
}
