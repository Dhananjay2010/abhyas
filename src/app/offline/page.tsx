/**
 * Offline fallback page.
 *
 * Shown by the service worker when the user is offline and tries to navigate
 * to a page that isn't cached. This page has inline styles so it works even
 * when the external CSS files (_next/static/css/) are not cached.
 *
 * Enhanced with client-side retry feedback: shows "Still offline" message
 * when retry is attempted while still offline, and only reloads when back online.
 * The service worker serves this page under the original URL the user was
 * navigating to, so window.location.href reflects the intended destination.
 *
 * Marked with data-offline attribute to hide bottom nav.
 * Uses shared OfflineScreen component to ensure consistent design with in-app errors.
 */

import { OfflineScreen } from "@/components/offline-screen";

export default function OfflinePage() {
  return <OfflineScreen fullPage={true} />;
}
