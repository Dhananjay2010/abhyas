"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center px-6">
          <div className="w-full max-w-md text-center">
            <h1 className="text-3xl font-bold tracking-tight">Application Error</h1>
            <p className="mt-4 text-gray-600 dark:text-gray-400">
              A critical error occurred. Please refresh the page.
            </p>
            {error.digest && (
              <p className="mt-2 font-mono text-xs text-gray-500">
                Error ID: {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              className="mt-6 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
