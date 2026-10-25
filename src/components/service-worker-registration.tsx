"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker on the client.
 *
 * Mounted once in the root layout. Only runs in production (service workers
 * are disabled in dev to avoid caching issues during development).
 * 
 * In development, explicitly unregisters any service worker that was registered
 * before, so dev-server HMR keeps working.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV === "production") {
      // Production: register the service worker
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
    } else {
      // Development: unregister any existing service worker
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister().then(() => {
            console.log("Service Worker unregistered in development:", registration.scope);
          });
        }
      });
    }
  }, []);

  return null;
}
