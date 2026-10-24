"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker on the client.
 *
 * Mounted once in the root layout. Only runs in production (service workers
 * are disabled in dev to avoid caching issues during development).
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    // Only register in production and when service workers are supported
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("Service Worker registered:", registration.scope);

          // Check for updates periodically (every hour)
          setInterval(
            () => {
              registration.update();
            },
            60 * 60 * 1000
          );
        })
        .catch((error) => {
          console.error("Service Worker registration failed:", error);
        });
    }
  }, []);

  return null;
}
