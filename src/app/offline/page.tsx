"use client";

import { branding } from "@/lib/branding";

/**
 * Offline fallback page.
 *
 * Shown by the service worker when the user is offline and tries to navigate
 * to a page that isn't cached. Reads branding from the centralized config.
 */
export default function OfflinePage() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Offline - {branding.name}</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: ${branding.colors.bg};
            color: #f5f5f5;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 1.5rem;
          }
          .container {
            text-align: center;
            max-width: 400px;
          }
          .icon {
            width: 96px;
            height: 96px;
            margin: 0 auto 2rem;
            opacity: 0.8;
          }
          h1 {
            font-size: 1.5rem;
            margin-bottom: 0.75rem;
            font-weight: 600;
          }
          p {
            font-size: 1rem;
            line-height: 1.5;
            color: #a3a3a3;
            margin-bottom: 2rem;
          }
          button {
            background: ${branding.colors.accent};
            color: ${branding.colors.accentFg};
            border: none;
            padding: 0.875rem 2rem;
            font-size: 1rem;
            font-weight: 500;
            border-radius: 0.5rem;
            cursor: pointer;
            transition: background 0.2s;
          }
          button:hover {
            background: ${branding.colors.accentHover};
          }
          button:active {
            transform: translateY(1px);
          }
        `,
          }}
        />
      </head>
      <body>
        <div className="container">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding.icons.icon192}
            alt={branding.name}
            className="icon"
            width="96"
            height="96"
          />
          <h1>You&apos;re offline</h1>
          <p>
            {branding.name} needs an internet connection to load new content.
            Check your connection and try again.
          </p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </body>
    </html>
  );
}

/**
 * This page can be pre-rendered at build time even though it's a client component.
 * The service worker caches the static HTML and serves it offline. The client-side
 * interactivity (reload button) becomes available when the page loads.
 */
export const dynamic = "force-static";
