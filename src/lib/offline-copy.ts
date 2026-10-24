/**
 * Offline screen copy constants.
 *
 * Shared across:
 * - /offline route (SW fallback page)
 * - In-app error boundaries (error.tsx, global-error.tsx)
 * - Service worker route (sw.js/route.ts)
 *
 * Ensures ONE stable offline experience with consistent messaging.
 */

import { branding } from "@/lib/branding";

export const OFFLINE_SCREEN_HEADING = "You're offline";
export const OFFLINE_SCREEN_BODY = `${branding.name} needs an internet connection to load new content. Check your connection and try again.`;
export const OFFLINE_SCREEN_BUTTON_LABEL = "Retry";
