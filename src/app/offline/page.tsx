/**
 * Offline fallback page.
 *
 * Shown by the service worker when the user is offline and tries to navigate
 * to a page that isn't cached. This page has inline styles so it works even
 * when the external CSS files (_next/static/css/) are not cached.
 *
 * Enhanced with client-side retry feedback: shows "Still offline" message
 * when retry is attempted while still offline, and only reloads when back online.
 * Reloads the original URL the user was navigating to (from ?url= query param).
 */

import { branding } from "@/lib/branding";
import { OfflineRetry } from "./offline-retry";

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

  return (
    <>
      {/* Inline styles for html and body to prevent white frame when CSS isn't cached */}
      <style dangerouslySetInnerHTML={{
        __html: `
          html, body {
            margin: 0;
            padding: 0;
            background: ${branding.colors.bg};
          }
        `
      }} />
      
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

          {/* Retry button with client-side feedback (shows "Still offline" when offline) */}
          <OfflineRetry />
        </div>
      </div>
    </>
  );
}
