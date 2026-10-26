/**
 * Per-gym white-label branding configuration for Abhyas.
 *
 * Each gym deployment can set its own brand identity (name, colors, logo,
 * domain, timezone) without code changes. The active brand is selected by
 * NEXT_PUBLIC_BRAND environment variable, falling back to 'default'.
 *
 * Colors flow into the UI through Tailwind 4 theme tokens (CSS variables),
 * so components use semantic names (--color-accent) rather than hard-coded
 * hex values.
 *
 * See docs/white-label.md for deployment and customization guide.
 */

import { canonicalizeTimezone } from "./timezone-canonical";

/**
 * Brand color configuration.
 * All colors must be valid 6-digit hex codes (#RRGGBB).
 */
export type BrandColors = {
  /** Primary accent color (CTAs, primary actions, brand identity) */
  accent: string;
  /** Accent hover state (slightly darker/more saturated) */
  accentHover: string;
  /** Foreground color on accent background (for contrast) */
  accentFg: string;
  /** Page background color */
  bg: string;
  /** Elevated surface color (cards, panels) */
  surface: string;
  /** Secondary surface color (inputs, secondary cards) */
  surface2: string;
  /** Border color */
  border: string;
  /** Primary text color */
  fg: string;
  /** Muted/secondary text color */
  muted: string;
  /** Success color (confirmations, progress) */
  success: string;
  /** Warning color (version updates, non-critical alerts) */
  warning: string;
  /** Foreground color on warning background (for contrast) */
  warningFg: string;
  /** Danger/error color */
  danger: string;
  /** Chart data color (validated for contrast against surface) */
  chart: string;
};

/**
 * Complete brand configuration for one gym.
 */
export type Brand = {
  /** Unique identifier for this brand (matches NEXT_PUBLIC_BRAND) */
  id: string;
  /** Full application name */
  name: string;
  /** Short name for home screen after PWA install (max 12 chars recommended) */
  shortName: string;
  /** One-sentence description */
  description: string;
  /** Canonical site URL (used for metadata, Open Graph, manifest scope) */
  siteUrl: string;
  /**
   * IANA timezone name for this gym's location (e.g. 'America/New_York').
   * Used as the default timezone for users of this gym when the user's
   * browser timezone cannot be detected (SSR, old browsers).
   * Falls back to browser timezone when not set.
   * @see https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
   */
  timezone?: string;
  /**
   * Logo image URL (relative to /public/ or absolute).
   * Shown in the app header/landing page. If not set, the text name is shown.
   */
  logo?: string;
  /**
   * Optional tagline or slogan, shown on the landing page.
   * For example, the Hindi word for "practice" (अभ्यास) for the default brand.
   */
  tagline?: string;
  /**
   * Optional language code for the tagline (e.g., 'hi' for Hindi, 'es' for Spanish).
   * Used to set the `lang` attribute on the tagline element for proper text rendering.
   */
  taglineLang?: string;
  /**
   * Default unit system for new members ('metric' or 'imperial').
   * New users start with this setting and can change it in Settings.
   * Metric: kg, cm; Imperial: lb, in.
   */
  defaultUnits: "metric" | "imperial";
  /** Brand color palette */
  colors: BrandColors;
  /**
   * Icon paths (all relative to /public/).
   * For white-label deployments, replace icon files in /public/icons/
   * with your own, keeping the same filenames.
   */
  icons: {
    /** 192×192 icon, any purpose */
    icon192: string;
    /** 512×512 icon, any purpose (splash screen, high-DPI) */
    icon512: string;
    /** 192×192 maskable icon with safe zone (Android adaptive icons) */
    maskable192: string;
    /** 512×512 maskable icon with safe zone */
    maskable512: string;
    /** Apple touch icon (180×180, iOS home screen) */
    appleTouchIcon: string;
    /** Favicon */
    favicon: string;
  };
};

// ---------------------------------------------------------------------------
// Brand definitions
// ---------------------------------------------------------------------------

/**
 * Default brand: Abhyas.
 * Used when NEXT_PUBLIC_BRAND is not set or invalid.
 */
const abhyas: Brand = {
  id: "default",
  name: "Abhyas",
  shortName: "Abhyas",
  description:
    "Workouts built around your time. Abhyas tells you exactly what to train, guides you through it, and makes next week harder than this one.",
  siteUrl: "https://abhyas-indol.vercel.app",
  // No timezone set — falls back to browser detection
  // No logo set — shows text name
  tagline: "अभ्यास", // Hindi word for "practice"
  taglineLang: "hi",  // Hindi language code
  defaultUnits: "metric",
  colors: {
    accent: "#ff9a2e",
    accentHover: "#e8850c",
    accentFg: "#1a1000",
    bg: "#0a0c0e",
    surface: "#151a1f",
    surface2: "#1d242b",
    border: "#607280",
    fg: "#ecf1f6",
    muted: "#93a1ae",
    success: "#4ade80",
    warning: "#fbbf24",
    warningFg: "#1a1000",
    danger: "#f87171",
    chart: "#d95926",
  },
  icons: {
    icon192: "/icons/icon-192.png",
    icon512: "/icons/icon-512.png",
    maskable192: "/icons/icon-192-maskable.png",
    maskable512: "/icons/icon-512-maskable.png",
    appleTouchIcon: "/icons/apple-touch-icon.png",
    favicon: "/favicon.ico",
  },
};

/**
 * Example second brand to demonstrate switching.
 * A white-label gym deployment would define its own brand here.
 */
const example: Brand = {
  id: "example",
  name: "FitCore Gym",
  shortName: "FitCore",
  description:
    "Your personalized training coach. FitCore builds your program, guides every session, and tracks your progress.",
  siteUrl: "https://example-gym.com",
  timezone: "America/New_York",
  logo: "/icons/icon-192.png", // Example: uses same icon as logo
  defaultUnits: "metric",
  colors: {
    accent: "#3b82f6", // blue
    accentHover: "#2563eb",
    accentFg: "#ffffff",
    bg: "#0a0a0a",
    surface: "#1a1a1a",
    surface2: "#262626",
    border: "#707070",
    fg: "#fafafa",
    muted: "#a3a3a3",
    success: "#22c55e",
    warning: "#f59e0b",
    warningFg: "#1a1000",
    danger: "#ef4444",
    chart: "#f97316", // orange for charts
  },
  icons: {
    // In a real deployment, these would point to FitCore's own icon files
    icon192: "/icons/icon-192.png",
    icon512: "/icons/icon-512.png",
    maskable192: "/icons/icon-192-maskable.png",
    maskable512: "/icons/icon-512-maskable.png",
    appleTouchIcon: "/icons/apple-touch-icon.png",
    favicon: "/favicon.ico",
  },
};

/**
 * Registry of all available brands.
 * Add new gym brands here.
 */
const brands: Record<string, Brand> = {
  default: abhyas,
  example,
};

/**
 * Get all registered brands for testing and validation.
 * Returns a read-only array of all brand configurations.
 */
export function getAllBrands(): readonly Brand[] {
  return Object.values(brands);
}

// ---------------------------------------------------------------------------
// Brand selection and validation
// ---------------------------------------------------------------------------

/**
 * Validate and canonicalize a timezone string.
 * Delegates to canonicalizeTimezone for validation and normalization.
 * Returns the canonical IANA timezone name if valid, null otherwise.
 * 
 * Legacy aliases (Asia/Calcutta, Europe/Kiev) are mapped to canonical names
 * (Asia/Kolkata, Europe/Kyiv). This ensures stored values are always canonical.
 */
export function validateTimezone(tz: string | null | undefined): string | null {
  if (!tz) return null;
  return canonicalizeTimezone(tz);
}

/**
 * Validate a hex color string.
 * Returns true if the color is a valid 6-digit hex code.
 */
function isValidHexColor(color: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(color);
}

/**
 * Validate a brand configuration.
 * Throws if any required field is missing or invalid.
 */
function validateBrand(brand: Brand): void {
  if (!brand.id || typeof brand.id !== "string") {
    throw new Error(`Brand must have a string id (got: ${brand.id})`);
  }
  if (!brand.name || typeof brand.name !== "string") {
    throw new Error(`Brand ${brand.id}: name must be a non-empty string`);
  }
  if (!brand.shortName || typeof brand.shortName !== "string") {
    throw new Error(`Brand ${brand.id}: shortName must be a non-empty string`);
  }
  if (brand.shortName.length > 12) {
    console.warn(
      `Brand ${brand.id}: shortName "${brand.shortName}" is ${brand.shortName.length} chars (max 12 recommended for home screen)`
    );
  }
  if (!brand.description || typeof brand.description !== "string") {
    throw new Error(`Brand ${brand.id}: description must be a non-empty string`);
  }
  if (!brand.siteUrl || typeof brand.siteUrl !== "string") {
    throw new Error(`Brand ${brand.id}: siteUrl must be a non-empty string`);
  }
  try {
    new URL(brand.siteUrl);
  } catch {
    throw new Error(`Brand ${brand.id}: siteUrl must be a valid URL (got: ${brand.siteUrl})`);
  }

  // Validate timezone if present
  if (brand.timezone && !validateTimezone(brand.timezone)) {
    throw new Error(
      `Brand ${brand.id}: timezone "${brand.timezone}" is not a valid IANA timezone name`
    );
  }

  // Validate colors
  const colorKeys: (keyof BrandColors)[] = [
    "accent",
    "accentHover",
    "accentFg",
    "bg",
    "surface",
    "surface2",
    "border",
    "fg",
    "muted",
    "success",
    "warning",
    "warningFg",
    "danger",
    "chart",
  ];
  for (const key of colorKeys) {
    const color = brand.colors[key];
    if (!isValidHexColor(color)) {
      throw new Error(
        `Brand ${brand.id}: colors.${key} must be a valid hex color (got: ${color})`
      );
    }
  }

  // Validate icons
  const iconKeys: (keyof Brand["icons"])[] = [
    "icon192",
    "icon512",
    "maskable192",
    "maskable512",
    "appleTouchIcon",
    "favicon",
  ];
  for (const key of iconKeys) {
    const path = brand.icons[key];
    if (typeof path !== "string" || !path.startsWith("/")) {
      throw new Error(
        `Brand ${brand.id}: icons.${key} must be an absolute path starting with / (got: ${path})`
      );
    }
  }
}

/**
 * Select the active brand based on NEXT_PUBLIC_BRAND environment variable.
 * Throws if the brand is not found (fails the build).
 * Validates the selected brand on first access.
 */
function selectBrand(): Brand {
  const brandId = process.env.NEXT_PUBLIC_BRAND || "default";
  const brand = brands[brandId];

  if (!brand) {
    const validIds = Object.keys(brands).join(", ");
    throw new Error(
      `NEXT_PUBLIC_BRAND="${brandId}" not found in brand registry. Valid brand ids: ${validIds}`
    );
  }

  try {
    validateBrand(brand);
  } catch (error) {
    console.error(`Brand validation failed for "${brandId}":`, error);
    throw error;
  }

  return brand;
}

/**
 * The active brand for this deployment.
 * Selected at build time based on NEXT_PUBLIC_BRAND.
 */
export const branding = selectBrand();

/**
 * Legacy exports for backward compatibility.
 * New code should use branding.colors directly.
 */
export const themeColor = branding.colors.bg;
export const backgroundColor = branding.colors.bg;

/**
 * Get CSS variable declarations for the active brand's colors.
 * Returns a string suitable for inline <style> injection.
 * 
 * Security: All colors are validated as strict hex codes during brand validation.
 */
export function getBrandCssVariables(brand: Brand = branding): string {
  // Validate all colors are strict hex codes (defense in depth)
  const colorEntries = Object.entries(brand.colors);
  for (const [key, value] of colorEntries) {
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
      throw new Error(
        `Brand ${brand.id}: colors.${key} must be a strict 6-digit hex code for CSS injection safety (got: ${value})`
      );
    }
  }

  return [
    `--color-accent: ${brand.colors.accent};`,
    `--color-accent-hover: ${brand.colors.accentHover};`,
    `--color-accent-fg: ${brand.colors.accentFg};`,
    `--color-bg: ${brand.colors.bg};`,
    `--color-surface: ${brand.colors.surface};`,
    `--color-surface-2: ${brand.colors.surface2};`,
    `--color-border: ${brand.colors.border};`,
    `--color-fg: ${brand.colors.fg};`,
    `--color-muted: ${brand.colors.muted};`,
    `--color-success: ${brand.colors.success};`,
    `--color-warning: ${brand.colors.warning};`,
    `--color-warning-fg: ${brand.colors.warningFg};`,
    `--color-danger: ${brand.colors.danger};`,
    `--color-chart: ${brand.colors.chart};`,
  ].join(" ");
}

/**
 * Get the default unit system for new members.
 * Returns 'metric' or 'imperial' based on the active brand's configuration.
 */
export function getDefaultUnits(): "metric" | "imperial" {
  return branding.defaultUnits;
}
