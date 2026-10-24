/**
 * Site branding and contact information.
 * 
 * This module provides a single typed accessor for gym/organization branding
 * that can later be pointed at a full branding config system. For now, it reads
 * from environment variables with sensible defaults.
 * 
 * White-label deployments should set these via Vercel environment variables:
 * - NEXT_PUBLIC_GYM_NAME: The gym's display name
 * - NEXT_PUBLIC_SUPPORT_EMAIL: Contact email for support/legal inquiries
 * - NEXT_PUBLIC_GYM_ADDRESS: Physical address (optional)
 * - NEXT_PUBLIC_GYM_PHONE: Contact phone (optional)
 */

/**
 * Legal documents last updated date.
 * This should be updated whenever the Privacy Policy or Terms of Service
 * are materially changed. Format is locale-stable (DD Month YYYY).
 */
export const LEGAL_LAST_UPDATED = "24 October 2026";

/**
 * Backup retention period in days.
 * 
 * This is a placeholder value that should be updated to match the actual
 * backup retention policy of the hosting provider (Supabase).
 * 
 * As of this writing, Supabase's default retention is typically 7-30 days
 * for daily backups depending on the plan, but this should be verified
 * and set to the actual value for your deployment.
 * 
 * TODO: Set this to the actual backup retention period for your deployment.
 */
export const BACKUP_RETENTION_DAYS = 30; // Placeholder - verify with hosting provider

export interface SiteInfo {
  /** The gym or organization name (e.g., "Fitness First Mumbai") */
  gymName: string;
  /** Support/contact email address */
  supportEmail: string;
  /** Physical address (optional) */
  gymAddress?: string;
  /** Contact phone number (optional) */
  gymPhone?: string;
  /** App display name (typically same as gymName or "Abhyas") */
  appName: string;
}

/**
 * Get site branding and contact information.
 * 
 * Returns configuration from environment variables with defaults.
 * This function can later be modified to read from a database-backed
 * branding config system without changing call sites.
 */
export function getSiteInfo(): SiteInfo {
  return {
    gymName: process.env.NEXT_PUBLIC_GYM_NAME || "[GYM NAME]",
    supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@example.com",
    gymAddress: process.env.NEXT_PUBLIC_GYM_ADDRESS,
    gymPhone: process.env.NEXT_PUBLIC_GYM_PHONE,
    appName: process.env.NEXT_PUBLIC_APP_NAME || "Abhyas",
  };
}

/**
 * Check if site info is still using placeholder values.
 * Useful for showing warnings in admin UIs.
 */
export function hasPlaceholderInfo(): boolean {
  const info = getSiteInfo();
  return (
    info.gymName === "[GYM NAME]" ||
    info.supportEmail === "support@example.com"
  );
}
