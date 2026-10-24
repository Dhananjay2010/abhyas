import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Pure decision function: should we refresh based on this event?
 * Extracted for testability.
 */
export function shouldRefreshOnEvent(
  eventType: "mount" | "visibilitychange" | "pageshow",
  visibilityState?: "visible" | "hidden",
  pageshowPersisted?: boolean,
): boolean {
  if (eventType === "mount") {
    return true;
  }

  if (eventType === "visibilitychange") {
    return visibilityState === "visible";
  }

  if (eventType === "pageshow") {
    return pageshowPersisted === true;
  }

  return false;
}

/**
 * Injectable seam for attaching resume refresh listeners.
 * Allows testing without DOM.
 * 
 * Calls refresh once on mount, then attaches listeners for visibilitychange and pageshow.
 */
export function attachResumeRefresh(
  target: {
    addEventListener: (event: string, handler: EventListener) => void;
    removeEventListener: (event: string, handler: EventListener) => void;
    visibilityState?: string;
  },
  refresh: () => void,
): () => void {
  // Refresh on mount
  if (shouldRefreshOnEvent("mount")) {
    refresh();
  }

  const handleVisibilityChange = () => {
    if (shouldRefreshOnEvent("visibilitychange", target.visibilityState as "visible" | "hidden")) {
      refresh();
    }
  };

  const handlePageShow = (event: Event) => {
    const persisted = (event as PageTransitionEvent).persisted;
    if (shouldRefreshOnEvent("pageshow", undefined, persisted)) {
      refresh();
    }
  };

  target.addEventListener("visibilitychange", handleVisibilityChange);
  (target as Window).addEventListener("pageshow", handlePageShow as EventListener);

  return () => {
    target.removeEventListener("visibilitychange", handleVisibilityChange);
    (target as Window).removeEventListener("pageshow", handlePageShow as EventListener);
  };
}

/**
 * Custom hook to refresh router data on mount, visibilitychange, and pageshow (bfcache).
 * Ensures fresh data when resuming a session after backgrounding or navigation.
 * 
 * This prevents the router cache from serving stale data when the user:
 * - Returns to the app after ~30s in the background
 * - Navigates back from another page
 * - Restores the page from bfcache
 */
export function useResumeRefresh() {
  const router = useRouter();

  useEffect(() => {
    return attachResumeRefresh(document, () => router.refresh());
  }, [router]);
}
