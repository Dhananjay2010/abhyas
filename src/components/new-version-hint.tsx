"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { branding } from "@/lib/branding";
import { isChunkLoadError } from "@/lib/chunk-load-error";
import { activeTab } from "@/lib/nav";

/**
 * Determine if the new version hint should be shown on this route.
 *
 * Suppressed on active session, breathe, and yoga video routes:
 * - /session* (guided workout in progress)
 * - /breathe* (breathing exercise in progress)
 * - /yoga when a video is playing (detected by [data-video-playing])
 *
 * The hint is shown after leaving these routes.
 *
 * @param pathname - Current pathname from usePathname()
 * @returns true if the hint can be shown on this route
 */
export function shouldShowUpdateHint(pathname: string): boolean {
  if (pathname.startsWith("/session") || pathname.startsWith("/breathe")) {
    return false;
  }
  
  if (pathname.startsWith("/yoga")) {
    if (typeof document !== "undefined") {
      const videoPlaying = document.querySelector("[data-video-playing]");
      if (videoPlaying) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * New version notification.
 *
 * Detects when a new build is deployed by:
 * 1. Checking /api/version on focus/visibility change and every 5 minutes
 * 2. Listening for service worker controllerchange events (SW updates)
 * 3. Catching ChunkLoadError from failed dynamic imports (JS chunk missing after deploy)
 *
 * Shows a dismissible banner when a version mismatch is detected.
 * NEVER auto-reloads. Especially not during a session.
 *
 * Position: bottom toast above the nav, respecting safe-area-inset-bottom.
 * Suppressed on /session*, /breathe*, and /yoga with video playing.
 *
 * Now runs even when there is no SW controller (fixes QA LOW-2: first visit
 * or hard reload can check /api/version without waiting for SW install).
 *
 * Uses warning color from branding config.
 */
export function NewVersionHint() {
  const [showHint, setShowHint] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const pathname = usePathname();

  // Watch for yoga video playing state
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const observer = new MutationObserver(() => {
      const isPlaying = document.documentElement.hasAttribute("data-video-playing");
      setVideoPlaying(isPlaying);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-video-playing"],
    });

    // Check initial state
    setVideoPlaying(document.documentElement.hasAttribute("data-video-playing"));

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hadController = "serviceWorker" in navigator && !!navigator.serviceWorker.controller;
    const clientVersion = process.env.NEXT_PUBLIC_BUILD_SHA || "dev";

    let swUpdateInterval: number | null = null;
    let versionCheckInterval: number | null = null;
    let visibilityCheckTimeout: number | null = null;

    async function checkVersion() {
      try {
        const response = await fetch("/api/version", {
          cache: "no-store",
        });
        if (!response.ok) return;

        const data = await response.json();
        const serverVersion = data.version;

        if (serverVersion && serverVersion !== clientVersion && serverVersion !== "dev") {
          setShowHint(true);
        }
      } catch {
        // Ignore version check errors (offline, etc.)
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        if (visibilityCheckTimeout !== null) {
          window.clearTimeout(visibilityCheckTimeout);
        }
        visibilityCheckTimeout = window.setTimeout(() => {
          checkVersion();
        }, 1000);
      }
    }

    function handleFocus() {
      if (visibilityCheckTimeout !== null) {
        window.clearTimeout(visibilityCheckTimeout);
      }
      visibilityCheckTimeout = window.setTimeout(() => {
        checkVersion();
      }, 1000);
    }

    function handleControllerChange() {
      const win = window as Window & { __reloadingForNewVersion?: boolean };
      if (hadController && !win.__reloadingForNewVersion) {
        setShowHint(true);
      }
    }

    if ("serviceWorker" in navigator && hadController) {
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

        navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

        registration.update().catch(() => {
          // Ignore update check errors
        });
      }

      checkForUpdates();

      swUpdateInterval = window.setInterval(() => {
        navigator.serviceWorker.ready.then((registration) => {
          registration.update().catch(() => {
            // Ignore update check errors
          });
        });
      }, 5 * 60 * 1000);
    }

    versionCheckInterval = window.setInterval(() => {
      checkVersion();
    }, 5 * 60 * 1000);

    // Listen for unhandled rejections that are chunk load errors
    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      const error = event.reason;
      if (error instanceof Error && isChunkLoadError(error)) {
        setShowHint(true);
        event.preventDefault(); // Prevent console error
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    checkVersion();

    return () => {
      if (swUpdateInterval !== null) {
        window.clearInterval(swUpdateInterval);
      }
      if (versionCheckInterval !== null) {
        window.clearInterval(versionCheckInterval);
      }
      if (visibilityCheckTimeout !== null) {
        window.clearTimeout(visibilityCheckTimeout);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      }
    };
  }, []);

  function handleRefresh() {
    if (typeof window !== "undefined") {
      (window as Window & { __reloadingForNewVersion?: boolean }).__reloadingForNewVersion = true;
    }
    window.location.reload();
  }

  const shouldShow = showHint && shouldShowUpdateHint(pathname) && !videoPlaying;

  if (!shouldShow) return null;

  const hasBottomNav = !!activeTab(pathname);
  const bottomOffset = hasBottomNav 
    ? "calc(4rem + env(safe-area-inset-bottom))"
    : "env(safe-area-inset-bottom)";

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: bottomOffset,
        left: 0,
        right: 0,
        padding: "0.75rem 1rem",
        background: branding.colors.warning,
        color: branding.colors.warningFg,
        fontSize: "0.875rem",
        fontWeight: 500,
        textAlign: "center",
        zIndex: 25,
        boxShadow: "0 -2px 8px rgba(0, 0, 0, 0.15)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
      }}
    >
      <span>A new version is available</span>
      <button
        onClick={handleRefresh}
        style={{
          padding: "0.5rem 1rem",
          minHeight: "44px",
          background: branding.colors.warningFg,
          color: branding.colors.warning,
          border: "none",
          borderRadius: "0.25rem",
          fontSize: "0.875rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Reload
      </button>
      <button
        onClick={() => setShowHint(false)}
        aria-label="Dismiss"
        style={{
          padding: "0.5rem",
          minHeight: "44px",
          minWidth: "44px",
          background: "transparent",
          color: branding.colors.warningFg,
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
