"use client";

import { useEffect } from "react";
import { syncServiceWorker } from "@/lib/sw-logic";

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

    const env = process.env.NODE_ENV;
    
    syncServiceWorker(env, navigator.serviceWorker)
      .then(() => {
        if (env === "production") {
          // In production, set up periodic update checks (every hour)
          navigator.serviceWorker.ready.then((registration) => {
            setInterval(
              () => {
                registration.update();
              },
              60 * 60 * 1000
            );
          });
        }
      })
      .catch((error) => {
        if (env === "production") {
          console.error("Service Worker registration failed:", error);
        }
        // In dev, unregister failures are not critical
      });
  }, []);

  return null;
}
