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
    <html lang="en">
      <head>
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: #0a0c0e;
            color: #e5e7eb;
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
            color: #9ca3af;
            line-height: 1.5;
          }
          .digest {
            margin-top: 0.5rem;
            font-family: ui-monospace, monospace;
            font-size: 0.75rem;
            color: #6b7280;
          }
          button {
            margin-top: 1.5rem;
            padding: 0.75rem 1.5rem;
            background: #f97316;
            color: white;
            font-weight: 600;
            border: none;
            border-radius: 0.75rem;
            cursor: pointer;
            transition: background 0.2s;
          }
          button:hover {
            background: #ea580c;
          }
        `}</style>
      </head>
      <body>
        <main>
          <h1>Application Error</h1>
          <p>A critical error occurred. Please refresh the page.</p>
          {error.digest && (
            <p className="digest">Error ID: {error.digest}</p>
          )}
          <button onClick={reset}>Try again</button>
        </main>
      </body>
    </html>
  );
}
