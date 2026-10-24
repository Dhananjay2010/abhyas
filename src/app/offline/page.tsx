/**
 * Offline fallback page.
 *
 * Shown by the service worker when the user is offline and tries to navigate
 * to a page that isn't cached. Rendered inside the root layout, so it gets
 * the brand's CSS variables and bottom nav automatically.
 *
 * This is a server component that works without JavaScript. The retry link
 * is a plain anchor that reloads the page.
 */

import { branding } from "@/lib/branding";

export default function OfflinePage() {
  return (
    <div className="flex items-center justify-center min-h-screen px-6 pb-safe" data-hide-nav>
      <div className="text-center max-w-md">
        {/* Icon: inlined SVG with green accent */}
        <svg
          className="w-24 h-24 mx-auto mb-8 opacity-80"
          width="96"
          height="96"
          viewBox="0 0 96 96"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <rect width="96" height="96" rx="21.3333" fill="#22c55e" />
          <path
            d="M68.8 41.6L54.4 20.8C52.2667 17.8667 49.0667 16 45.3333 16C41.6 16 38.4 17.8667 36.2667 20.8L21.8667 41.6C19.7333 44.5333 19.7333 48.5333 21.8667 51.4667C23.7333 54.1333 26.9333 56 30.4 56H60.2667C63.7333 56 67.2 54.4 68.8 51.4667C70.9333 48.5333 70.9333 44.5333 68.8 41.6ZM45.3333 50.6667C43.7333 50.6667 42.6667 49.3333 42.6667 48V45.3333C42.6667 43.7333 44 42.6667 45.3333 42.6667C46.9333 42.6667 48 44 48 45.3333V48C48 49.3333 46.9333 50.6667 45.3333 50.6667ZM48 37.3333C48 38.6667 46.9333 40 45.3333 40C43.7333 40 42.6667 38.6667 42.6667 37.3333V29.3333C42.6667 28 44 26.6667 45.3333 26.6667C46.9333 26.6667 48 28 48 29.3333V37.3333Z"
            fill="var(--color-bg)"
          />
          <path
            d="M40 70.6667C40 68.4 41.6 66.6667 44 66.6667H70.6667C72.8 66.6667 74.6667 68.4 74.6667 70.6667C74.6667 73.0667 72.8 74.6667 70.6667 74.6667H44C41.6 74.6667 40 73.0667 40 70.6667Z"
            fill="var(--color-fg)"
            fillOpacity="0.8"
          />
          <path
            d="M24 70.6667C24 68.4 25.6 66.6667 28 66.6667H34.6667C36.8 66.6667 38.6667 68.4 38.6667 70.6667C38.6667 73.0667 36.8 74.6667 34.6667 74.6667H28C25.6 74.6667 24 73.0667 24 70.6667Z"
            fill="var(--color-fg)"
            fillOpacity="0.8"
          />
        </svg>

        <h1 className="text-2xl font-semibold mb-3">You&apos;re offline</h1>
        <p className="text-muted text-base leading-relaxed mb-8">
          {branding.name} needs an internet connection to load new content.
          Check your connection and try again.
        </p>

        {/* Retry button: green background with computed text color.
            Plain <a> href instead of Link - this page must work without JavaScript */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="inline-block px-8 py-3.5 text-base font-medium rounded-lg transition-opacity hover:opacity-90 active:translate-y-px"
          style={{
            backgroundColor: "#22c55e",
            color: "#000000",
          }}
        >
          Retry
        </a>
      </div>
    </div>
  );
}
