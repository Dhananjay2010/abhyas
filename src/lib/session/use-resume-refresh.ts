import { useEffect } from "react";
import { useRouter } from "next/navigation";

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
    // Refresh on mount to ensure we have fresh data
    router.refresh();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        // Page was restored from bfcache
        router.refresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [router]);
}
