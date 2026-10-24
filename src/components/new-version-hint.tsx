"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { branding } from "@/lib/branding";

/**
 * Determine if the new version hint should be shown on this route.
 *
 * Suppressed on active session and breathe routes:
 * - /session* (guided workout in progress)
 * - /breathe* (breathing exercise in progress)
 *
 * The hint is shown after leaving these routes.
 *
 * @param pathname - Current pathname from usePathname()
 * @returns true if the hint can be shown on this route
 */
export function shouldShowUpdateHint(pathname: string): boolean {
  return !pathname.startsWith("/session") && !pathname.startsWith("/breathe");
}

/**
 * New version notification.
 *
 * Listens for service worker updates (new build deployed) and shows
 * a small branded "New version – tap to refresh" hint.
 *
 * NEVER auto-reloads. Especially not during a session.
 *
 * Position: bottom toast above the nav, respecting safe-area-inset-bottom.
 * Suppressed on /session* and /breathe* routes (shown after leaving).
 *
 * Only shown when:
 * 1. The page was controlled by a SW at mount (not first install)
 * 2. A new SW replaced the previous one
 *
 * Uses colors from branding config.
 */
export function NewVersionHint() {
  const [showHint, setShowHint] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const hadController = !!navigator.serviceWorker.controller;

    if (!hadController) {
      return;
    }

    async function checkForUpdates() {
      const registration = await navigator.serviceWorker.ready;
      
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            setShowHint(true);
          }
        });
      });

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        const win = window as Window & { __reloadingForNewVersion?: boolean };
        if (hadController && !win.__reloadingForNewVersion) {
          setShowHint(true);
        }
      });

      registration.update().catch(() => {
        // Ignore update check errors
      });
    }

    checkForUpdates();

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
    if (typeof window !== "undefined") {
      (window as Window & { __reloadingForNewVersion?: boolean }).__reloadingForNewVersion = true;
    }
    window.location.reload();
  }

  const shouldShow = showHint && shouldShowUpdateHint(pathname);

  if (!shouldShow) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        padding: "0.75rem 1rem",
        paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
        background: branding.colors.accent,
        color: branding.colors.accentFg,
        fontSize: "0.875rem",
        fontWeight: 500,
        textAlign: "center",
        zIndex: 9999,
        boxShadow: "0 -2px 8px rgba(0, 0, 0, 0.15)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
      }}
    >
      <span>New version – tap to refresh</span>
      <button
        onClick={handleRefresh}
        style={{
          padding: "0.5rem 1rem",
          minHeight: "44px",
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
      <button
        onClick={() => setShowHint(false)}
        aria-label="Dismiss"
        style={{
          padding: "0.5rem",
          minHeight: "44px",
          minWidth: "44px",
          background: "transparent",
          color: branding.colors.accentFg,
          border: "none",
          fontSize: "1.25rem",
          lineHeight: 1,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        ×
      </button>
    </div>
  );
}
