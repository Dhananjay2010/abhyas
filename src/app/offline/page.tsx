/**
 * Offline fallback page.
 *
 * Shown by the service worker when the user is offline and tries to navigate
 * to a page that isn't cached. This page has inline styles so it works even
 * when the external CSS files (_next/static/css/) are not cached.
 *
 * This is a server component that works without JavaScript. The retry link
 * is a plain anchor that reloads the page.
 */

import { branding } from "@/lib/branding";

export default function OfflinePage() {
  // Inline styles so the page works without external CSS
  // All colors come from branding config (not hardcoded)
  const containerStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: "1.5rem",
    background: branding.colors.bg,
    color: branding.colors.fg,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };

  const contentStyle = {
    textAlign: "center" as const,
    maxWidth: "28rem",
  };

  const iconStyle = {
    width: "6rem",
    height: "6rem",
    margin: "0 auto 2rem",
    opacity: 0.8,
  };

  const headingStyle = {
    fontSize: "1.5rem",
    marginBottom: "0.75rem",
    fontWeight: 600,
  };

  const paragraphStyle = {
    fontSize: "1rem",
    lineHeight: 1.5,
    color: branding.colors.muted,
    marginBottom: "2rem",
  };

  const buttonStyle = {
    display: "inline-block",
    padding: "0.875rem 2rem",
    fontSize: "1rem",
    fontWeight: 500,
    borderRadius: "0.5rem",
    backgroundColor: branding.colors.accent,
    color: branding.colors.accentFg,
    textDecoration: "none",
    transition: "opacity 0.2s",
  };

  return (
    <div style={containerStyle}>
      <div style={contentStyle}>
        {/* App icon: real 192x192 icon from branding, precached by service worker */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={branding.icons.icon192}
          alt=""
          width={96}
          height={96}
          style={iconStyle}
        />

        <h1 style={headingStyle}>You&apos;re offline</h1>
        <p style={paragraphStyle}>
          {branding.name} needs an internet connection to load new content.
          Check your connection and try again.
        </p>

        {/* Retry button: green background with computed text color.
            Plain <a> href instead of Link - this page must work without JavaScript */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" style={buttonStyle}>
          Retry
        </a>
      </div>
    </div>
  );
}
