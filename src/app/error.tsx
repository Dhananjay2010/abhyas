"use client";

import { useEffect, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { isOfflineError } from "@/lib/offline-error";
import { isChunkLoadError } from "@/lib/chunk-load-error";
import { useOfflineError } from "@/contexts/offline-error-context";
import { OfflineScreen } from "@/components/offline-screen";
import { branding } from "@/lib/branding";

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

  useEffect(() => {
    console.error("Page error:", error);

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

  // Derive offline state from live online state consistently
  const offline = isOfflineError(error, online);
  const isChunkError = isChunkLoadError(error);

  // Update context and Sentry when offline status changes
  useEffect(() => {
    setIsOfflineError(offline);
    
    if (!offline && !isChunkError) {
      Sentry.captureException(error);
    }
  }, [offline, isChunkError, error, setIsOfflineError]);

  function handleReset() {
    setIsOfflineError(false);
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  function handleReload() {
    window.location.reload();
  }

  // Use shared OfflineScreen component for offline errors
  if (offline) {
    return <OfflineScreen />;
  }

  // ChunkLoadError: show version update hint
  if (isChunkError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <div
            className="mx-auto mb-4 rounded-full p-4"
            style={{
              background: branding.colors.warning,
              width: "fit-content",
            }}
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke={branding.colors.warningFg}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16h.01" />
              <path d="M12 8v4" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">A new version is available</h1>
          <p className="mt-4 text-muted">
            This page needs to reload to get the latest version.
          </p>
          <button
            onClick={handleReload}
            className="mt-6 rounded-xl bg-accent px-6 py-3 font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
          >
            Reload
          </button>
        </div>
      </main>
    );
  }

  // Non-offline, non-chunk error
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-bold tracking-tight">Something went wrong</h1>
        <p className="mt-4 text-muted">
          An unexpected error occurred. Please try again.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-muted">
            Error ID: {error.digest}
          </p>
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
