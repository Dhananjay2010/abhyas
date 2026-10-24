"use client";

import { useEffect, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { isOfflineError } from "@/lib/offline-error";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    console.error("Page error:", error);
    
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
      router.refresh();
      reset();
    });
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
          className="mt-6 rounded-xl bg-accent px-6 py-3 font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
