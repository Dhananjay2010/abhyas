/**
 * Centralized branding configuration for Abhyas.
 *
 * All brand identity (names, colors, icon paths) lives here so white-label
 * per-gym deployments can plug in their own values in one place.
 *
 * The manifest, metadata, offline page, and any branding UI must read from
 * this module rather than hardcoding values.
 */

export const branding = {
  /**
   * Full application name, displayed in most contexts.
   */
  name: "Abhyas",

  /**
   * Short name, displayed on the home screen after PWA install (12 chars max recommended).
   */
  shortName: "Abhyas",

  /**
   * One-sentence description of what the app does.
   */
  description:
    "One hour a day. Abhyas tells you exactly what to train, guides you through it, and makes next week harder than this one.",

  /**
   * Primary theme color. Used for:
   * - Browser UI tinting (address bar, task switcher)
   * - PWA splash screen background
   * - Manifest theme_color
   * - <meta name="theme-color">
   */
  themeColor: "#0a0c0e",

  /**
   * Background color for the PWA splash screen.
   * Should match the app's default background to avoid flash on launch.
   */
  backgroundColor: "#0a0c0e",

  /**
   * UI colors. These match the CSS custom properties in globals.css
   * and are used for server-rendered components (e.g. offline page).
   */
  colors: {
    /**
     * Primary background color (body, cards).
     */
    bg: "#0a0c0e",

    /**
     * Primary foreground color (body text).
     */
    fg: "#ecf1f6",

    /**
     * Muted text color (secondary text, descriptions).
     */
    muted: "#93a1ae",

    /**
     * Brand accent color (primary buttons, CTAs).
     */
    accent: "#ff9a2e",

    /**
     * Text color on accent background (for accessible contrast).
     */
    accentFg: "#1a1000",
  },

  /**
   * Icon paths. All icons are generated from icon-source.svg and live in /public/icons/.
   *
   * Standard PWA sizes:
   * - 192×192: minimum for PWA install prompt
   * - 512×512: used for splash screen
   * - maskable variants: safe zone for Android adaptive icons
   */
  icons: {
    /**
     * Favicon (32×32 PNG as .ico). Served at /favicon.ico by Next.js from public/.
     */
    favicon: "/favicon.ico",

    /**
     * Standard 192×192 icon, any purpose (Android, iOS when no apple-touch-icon).
     */
    icon192: "/icons/icon-192.png",

    /**
     * Standard 512×512 icon, any purpose (splash screen, high-DPI contexts).
     */
    icon512: "/icons/icon-512.png",

    /**
     * 192×192 maskable icon with safe zone (Android adaptive icons).
     */
    maskable192: "/icons/icon-192-maskable.png",

    /**
     * 512×512 maskable icon with safe zone.
     */
    maskable512: "/icons/icon-512-maskable.png",

    /**
     * Apple touch icon (180×180). Used on iOS home screen.
     */
    appleTouchIcon: "/icons/apple-touch-icon.png",
  },
} as const;
