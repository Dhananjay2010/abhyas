"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Global online event handler that refreshes the page when coming back online.
 * 
 * Prevents stale offline content (e.g. resume bar drawing over an offline page)
 * by triggering a server refresh when connectivity is restored.
 * 
 * Mounted in root layout so it applies to all routes.
 */
export function OnlineRefresh() {
  const router = useRouter();

  useEffect(() => {
    function handleOnline() {
      router.refresh();
    }

    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [router]);

  return null;
}
