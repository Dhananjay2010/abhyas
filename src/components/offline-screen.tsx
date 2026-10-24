/**
 * Shared offline screen component.
 *
 * Used by:
 * 1. /offline route (SW fallback page)
 * 2. In-app error boundaries (error.tsx, global-error.tsx)
 *
 * Ensures ONE stable offline experience with consistent icon, copy and button.
 * The SW offline HTML mirrors this markup exactly (generated at build time).
 */

import { branding } from "@/lib/branding";
import { OfflineRetry } from "@/app/offline/offline-retry";

export const OFFLINE_SCREEN_HEADING = "You're offline";
export const OFFLINE_SCREEN_BODY = `${branding.name} needs an internet connection to load new content. Check your connection and try again.`;
export const OFFLINE_SCREEN_BUTTON_LABEL = "Retry";

interface OfflineScreenProps {
  /**
   * Whether to use inline styles (for SW offline HTML generation).
   * When false, uses Tailwind classes for in-app error boundaries.
   */
  inline?: boolean;
  
  /**
   * Whether to render the full page wrapper (for /offline route).
   * When false, only renders the content (for error boundary use).
   */
  fullPage?: boolean;
}

export function OfflineScreen({ inline = false, fullPage = false }: OfflineScreenProps) {
  if (fullPage) {
    // Full page with inline styles for SW offline route
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
        
        <div style={containerStyle} data-offline="true">
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

            <h1 style={headingStyle}>{OFFLINE_SCREEN_HEADING}</h1>
            <p style={paragraphStyle}>
              {OFFLINE_SCREEN_BODY}
            </p>

            {/* Retry button with client-side feedback (shows "Still offline" when offline) */}
            <OfflineRetry />
          </div>
        </div>
      </>
    );
  }

  if (inline) {
    // Inline styles for in-app error boundary (no JS chunks)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6" data-offline="true">
        <div className="w-full max-w-md text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding.icons.icon192}
            alt=""
            width={96}
            height={96}
            style={{
              width: "6rem",
              height: "6rem",
              margin: "0 auto 2rem",
              opacity: 0.8,
            }}
          />

          <h1 
            style={{
              fontSize: "1.5rem",
              marginBottom: "0.75rem",
              fontWeight: 600,
            }}
          >
            {OFFLINE_SCREEN_HEADING}
          </h1>
          <p
            style={{
              fontSize: "1rem",
              lineHeight: 1.5,
              color: branding.colors.muted,
              marginBottom: "2rem",
            }}
          >
            {OFFLINE_SCREEN_BODY}
          </p>

          <OfflineRetry />
        </div>
      </div>
    );
  }

  // Tailwind classes for in-app error boundary (when JS is available)
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6" data-offline="true">
      <div className="w-full max-w-md text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={branding.icons.icon192}
          alt=""
          width={96}
          height={96}
          className="mx-auto mb-8 h-24 w-24 opacity-80"
        />

        <h1 className="mb-3 text-2xl font-semibold">
          {OFFLINE_SCREEN_HEADING}
        </h1>
        <p className="mb-8 text-base leading-relaxed text-muted">
          {OFFLINE_SCREEN_BODY}
        </p>

        <OfflineRetry />
      </div>
    </div>
  );
}
