"use client";

import { useEffect, useState, startTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { isOfflineError } from "@/lib/offline-error";
import { useOfflineError } from "@/contexts/offline-error-context";
import { determineRetryAction } from "@/lib/offline-retry-logic";

const RETRY_TIMEOUT_MS = 4000;

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const { setIsOfflineError } = useOfflineError();
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
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

  useEffect(() => {
    console.error("Page error:", error);
    
    const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
    const offline = isOfflineError(error, isOnline);
    
    setIsOfflineError(offline);
    
    if (!offline) {
      Sentry.captureException(error);
    }

    return () => {
      setIsOfflineError(false);
    };
  }, [error, setIsOfflineError]);

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

  async function handleReset() {
    if (!mountedRef.current) return;

    // For offline errors, use the same retry behavior as /offline page
    if (offline) {
      setChecking(true);
      setStillOffline(false);

      // Safety timeout
      timeoutRef.current = window.setTimeout(() => {
        if (mountedRef.current) {
          setChecking(false);
          setStillOffline(true);
        }
      }, RETRY_TIMEOUT_MS);

      // Check connectivity
      const onlineStatus = navigator.onLine;
      let fetchSucceeded = false;
      if (onlineStatus) {
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

      const action = determineRetryAction(onlineStatus, fetchSucceeded, null);

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
        // Clear timeout once navigation starts
        if (timeoutRef.current !== null) {
          window.clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setIsOfflineError(false);
        startTransition(() => {
          router.refresh();
          reset();
        });
      }
    } else {
      // Non-offline error: reset immediately
      setIsOfflineError(false);
      startTransition(() => {
        router.refresh();
        reset();
      });
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        {offline ? (
          <>
            <h1 className="text-3xl font-bold tracking-tight">You&apos;re offline</h1>
            <p className="mt-4 text-muted">
              This page needs an internet connection. Check your connection and try again.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold tracking-tight">Something went wrong</h1>
            <p className="mt-4 text-muted">
              An unexpected error occurred. Please try again.
            </p>
            {error.digest && (
              <p className="mt-2 font-mono text-xs text-muted">
                Error ID: {error.digest}
              </p>
            )}
          </>
        )}
        <button
          onClick={handleReset}
          disabled={checking}
          className="mt-6 rounded-xl bg-accent px-6 py-3 font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {checking ? "Checking…" : "Try again"}
        </button>
        {stillOffline && (
          <p
            className="mt-4 text-sm text-muted"
            style={{ minHeight: "1.25rem", visibility: stillOffline ? "visible" : "hidden" }}
            role="status"
            aria-live="polite"
          >
            {stillOffline ? "Still offline" : "\u00A0"}
          </p>
        )}
      </div>
    </main>
  );
}
