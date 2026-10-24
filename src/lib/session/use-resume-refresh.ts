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

export type DocumentLike = {
  visibilityState: string;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
};

export type WindowLike = {
  addEventListener(type: "pageshow", listener: (event: PageTransitionEvent) => void): void;
  removeEventListener(type: "pageshow", listener: (event: PageTransitionEvent) => void): void;
};

/**
 * Injectable seam for attaching resume refresh listeners.
 * Allows testing without DOM.
 * 
 * Calls refresh once on mount, then attaches listeners for visibilitychange and pageshow.
 * 
 * @param targets - { doc, win } because visibilitychange fires on document but pageshow fires on window
 * @param refresh - Callback to invoke when refresh is needed
 */
export function attachResumeRefresh(
  targets: {
    doc: DocumentLike;
    win: WindowLike;
  },
  refresh: () => void,
): () => void {
  // Refresh on mount
  if (shouldRefreshOnEvent("mount")) {
    refresh();
  }

  const handleVisibilityChange = () => {
    const state = targets.doc.visibilityState as "visible" | "hidden";
    if (shouldRefreshOnEvent("visibilitychange", state)) {
      refresh();
    }
  };

  const handlePageShow = (event: PageTransitionEvent) => {
    if (shouldRefreshOnEvent("pageshow", undefined, event.persisted)) {
      refresh();
    }
  };

  targets.doc.addEventListener("visibilitychange", handleVisibilityChange);
  targets.win.addEventListener("pageshow", handlePageShow);

  return () => {
    targets.doc.removeEventListener("visibilitychange", handleVisibilityChange);
    targets.win.removeEventListener("pageshow", handlePageShow);
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
    return attachResumeRefresh({ doc: document, win: window }, () => router.refresh());
  }, [router]);
}
