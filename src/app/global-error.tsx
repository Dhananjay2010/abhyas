"use client";

import { useEffect, useState, useRef, startTransition } from "react";
import * as Sentry from "@sentry/nextjs";
import { isOfflineError } from "@/lib/offline-error";
import { branding } from "@/lib/branding";
import { OFFLINE_SCREEN_HEADING, OFFLINE_SCREEN_BODY, OFFLINE_SCREEN_BUTTON_LABEL } from "@/lib/offline-copy";
import { determineRetryAction } from "@/lib/offline-retry-logic";

const RETRY_TIMEOUT_MS = 4000;

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
  const [checking, setChecking] = useState(false);
  const [stillOffline, setStillOffline] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    console.error("Global error:", error);
    
    // Capture exception once, using current online status
    const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
    if (!isOfflineError(error, isOnline)) {
      Sentry.captureException(error);
    }

    return () => {
      mountedRef.current = false;
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
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

  async function handleRetry(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!mountedRef.current) return;
    
    e.preventDefault();

    setChecking(true);
    setStillOffline(false);

    timeoutRef.current = window.setTimeout(() => {
      if (mountedRef.current) {
        setChecking(false);
        setStillOffline(true);
      }
    }, RETRY_TIMEOUT_MS);

    const isOnline = navigator.onLine;

    let fetchSucceeded = false;
    if (isOnline) {
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

    const action = determineRetryAction(isOnline, fetchSucceeded, null);

    if (action.type === "still-offline") {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (mountedRef.current) {
        setChecking(false);
        setStillOffline(true);
      }
    } else {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      window.location.reload();
    }
  }

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
          html, body {
            margin: 0;
            padding: 0;
            background: ${branding.colors.bg};
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
          .icon {
            width: 6rem;
            height: 6rem;
            margin: 0 auto 2rem;
            opacity: 0.8;
            display: block;
          }
          h1 {
            font-size: 1.5rem;
            margin-bottom: 0.75rem;
            font-weight: 600;
          }
          p {
            font-size: 1rem;
            line-height: 1.5;
            color: ${branding.colors.muted};
            margin-bottom: 2rem;
          }
          .digest {
            margin-top: 0.5rem;
            margin-bottom: 0.5rem;
            font-family: ui-monospace, monospace;
            font-size: 0.75rem;
            color: ${branding.colors.muted};
            opacity: 0.7;
          }
          .retry-link {
            display: inline-block;
            padding: 0.875rem 2rem;
            font-size: 1rem;
            font-weight: 500;
            border-radius: 0.5rem;
            background: ${branding.colors.accent};
            color: ${branding.colors.accentFg};
            text-decoration: none;
            border: none;
            cursor: pointer;
            transition: opacity 0.2s;
            min-height: 44px;
            min-width: 44px;
            text-align: center;
          }
          .retry-link:disabled {
            opacity: 0.6;
            pointer-events: none;
          }
          button {
            display: inline-block;
            margin-top: 1.5rem;
            padding: 0.75rem 1.5rem;
            background: ${branding.colors.accent};
            color: ${branding.colors.accentFg};
            font-weight: 600;
            border: none;
            border-radius: 0.75rem;
            cursor: pointer;
            text-decoration: none;
            transition: opacity 0.2s;
          }
          button:hover {
            background: ${branding.colors.accentHover};
          }
          .feedback {
            margin-top: 1rem;
            font-size: 0.875rem;
            color: ${branding.colors.muted};
            min-height: 1.25rem;
          }
          .feedback.hidden {
            visibility: hidden;
          }
        `}</style>
      </head>
      <body>
        <main>
          {offline ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={branding.icons.icon192}
                alt=""
                width={96}
                height={96}
                className="icon"
              />
              <h1>{OFFLINE_SCREEN_HEADING}</h1>
              <p>{OFFLINE_SCREEN_BODY}</p>
              <a
                href=""
                onClick={handleRetry}
                className="retry-link"
                style={{ opacity: checking ? 0.6 : 1, pointerEvents: checking ? "none" : "auto" }}
              >
                {checking ? "Checking…" : OFFLINE_SCREEN_BUTTON_LABEL}
              </a>
              <p className={`feedback ${stillOffline ? "" : "hidden"}`} role="status" aria-live="polite">
                {stillOffline ? "Still offline" : "\u00A0"}
              </p>
            </>
          ) : (
            <>
              <h1>Application Error</h1>
              <p>A critical error occurred. Please refresh the page.</p>
              {error.digest && (
                <p className="digest">Error ID: {error.digest}</p>
              )}
              <button onClick={handleReset}>Try again</button>
            </>
          )}
        </main>
      </body>
    </html>
  );
}
