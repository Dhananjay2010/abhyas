"use client";

import { useEffect, useState, startTransition } from "react";
import * as Sentry from "@sentry/nextjs";
import { isOfflineError } from "@/lib/offline-error";
import { branding } from "@/lib/branding";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    console.error("Global error:", error);
    
    // Capture exception once, using current online status
    const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
    if (!isOfflineError(error, isOnline)) {
      Sentry.captureException(error);
    }
  }, [error]);

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
    }
    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const offline = isOfflineError(error, online);

  function handleReset() {
    startTransition(() => {
      reset();
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    });
  }

  return (
    <html lang="en">
      <head>
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: ${branding.colors.bg};
            color: ${branding.colors.fg};
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1.5rem;
          }
          main {
            width: 100%;
            max-width: 28rem;
            text-align: center;
          }
          h1 {
            font-size: 1.875rem;
            font-weight: 700;
            line-height: 1.2;
          }
          p {
            margin-top: 1rem;
            color: ${branding.colors.muted};
            line-height: 1.5;
          }
          .digest {
            margin-top: 0.5rem;
            font-family: ui-monospace, monospace;
            font-size: 0.75rem;
            color: ${branding.colors.muted};
            opacity: 0.7;
          }
          button {
            margin-top: 1.5rem;
            padding: 0.75rem 1.5rem;
            background: ${branding.colors.accent};
            color: ${branding.colors.accentFg};
            font-weight: 600;
            border: none;
            border-radius: 0.75rem;
            cursor: pointer;
            transition: opacity 0.2s;
          }
          button:hover {
            background: ${branding.colors.accentHover};
          }
        `}</style>
      </head>
      <body>
        <main>
          {offline ? (
            <>
              <h1>You&apos;re offline</h1>
              <p>
                This page needs an internet connection. Check your connection and try again.
              </p>
            </>
          ) : (
            <>
              <h1>Application Error</h1>
              <p>A critical error occurred. Please refresh the page.</p>
              {error.digest && (
                <p className="digest">Error ID: {error.digest}</p>
              )}
            </>
          )}
          <button onClick={handleReset}>Try again</button>
        </main>
      </body>
    </html>
  );
}
