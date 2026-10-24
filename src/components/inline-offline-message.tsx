"use client";

import { useEffect, useState } from "react";

/**
 * Inline offline message for Today/History pages.
 * 
 * Shows a non-intrusive offline indicator within the app shell (preserving tab bar)
 * instead of the full-screen offline takeover.
 * 
 * Used when navigating away from cached pages while offline.
 */
export function InlineOfflineMessage() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const updateStatus = () => {
      setIsOffline(!navigator.onLine);
    };

    updateStatus();
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);

    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      className="mx-4 mt-4 rounded-xl border border-border bg-surface px-4 py-6 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="mb-2 text-lg font-semibold">You&apos;re offline</div>
      <div className="text-sm text-muted">
        This content isn&apos;t available offline. Connect to the internet to view it.
      </div>
    </div>
  );
}
