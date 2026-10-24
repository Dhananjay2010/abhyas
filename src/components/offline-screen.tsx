/**
 * Shared offline screen component.
 *
 * Used by:
 * 1. /offline route (SW fallback page) - fullPage={true}
 * 2. In-app error boundaries (error.tsx) - default props
 *
 * Ensures ONE stable offline experience with consistent icon, copy and button.
 * The SW offline HTML mirrors this markup exactly (generated at build time).
 */

import { branding } from "@/lib/branding";
import { OfflineRetry } from "@/app/offline/offline-retry";
import { OFFLINE_SCREEN_HEADING, OFFLINE_SCREEN_BODY } from "@/lib/offline-copy";

interface OfflineScreenProps {
  /**
   * Whether to render the full page wrapper (for /offline route).
   * When false, renders for in-app error boundary use.
   */
  fullPage?: boolean;
}

export function OfflineScreen({ fullPage = false }: OfflineScreenProps) {
  // Shared styles for both variants (identical spacing and sizing)
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

  // In-app error boundary variant (with inline styles for consistency when CSS fails to load)
  return (
    <div 
      style={{
        display: "flex",
        minHeight: "100vh",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 1.5rem",
      }}
      data-offline="true"
    >
      <div style={{ width: "100%", maxWidth: "28rem", textAlign: "center" as const }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={branding.icons.icon192}
          alt=""
          width={96}
          height={96}
          style={iconStyle}
        />

        <h1 style={headingStyle}>
          {OFFLINE_SCREEN_HEADING}
        </h1>
        <p style={paragraphStyle}>
          {OFFLINE_SCREEN_BODY}
        </p>

        <OfflineRetry />
      </div>
    </div>
  );
}
