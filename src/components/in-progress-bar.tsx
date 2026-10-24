"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { InProgressSession } from "@/lib/session/in-progress";

/**
 * L1: Client component that fetches the user's in-progress session on mount
 * and on every pathname change, rendering nothing while loading or logged out.
 *
 * M1: Fetches from /api/in-progress which is revalidated after startSession,
 * logSet, and finishSession so the bar disappears immediately after completion.
 */
export function InProgressBar() {
  const pathname = usePathname();
  const [session, setSession] = useState<InProgressSession | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchSession() {
      setLoading(true);
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const res = await fetch(`/api/in-progress?tz=${encodeURIComponent(tz)}`, {
          credentials: "same-origin",
          cache: "no-store",
        });

        if (cancelled) return;

        if (res.ok) {
          const data = await res.json();
          setSession(data.session ?? null);
        } else {
          setSession(null);
        }
      } catch {
        if (!cancelled) {
          setSession(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSession();

    // (a) Refetch on window focus and visibility change for soft navigation updates
    const handleFocus = () => {
      if (!cancelled) {
        fetchSession();
      }
    };

    const handleVisibilityChange = () => {
      if (!cancelled && document.visibilityState === "visible") {
        fetchSession();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pathname]);

  // Hide while loading, logged out, no session, or on /session/* routes
  if (loading || !session || pathname.startsWith("/session/")) {
    return null;
  }

  // QA (ii): Keep set count short and always visible at 390px
  const setsText =
    session.workingSetsLogged === 1
      ? "1 set"
      : `${session.workingSetsLogged} sets`;

  return (
    <div
      data-in-progress-bar
      className="fixed inset-x-0 z-20"
      style={{
        bottom: "calc(4rem + env(safe-area-inset-bottom))",
      }}
    >
      <div className="mx-auto max-w-md px-4">
        <Link
          href={`/session/${session.id}`}
          className="block rounded-lg border border-border bg-accent/10 px-4 py-3 text-sm font-medium text-accent backdrop-blur transition-colors hover:bg-accent/20"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1">
              <span className="truncate block">Workout in progress · {session.title}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">
              <span>{setsText}</span>
              <span className="font-semibold">· Resume</span>
            </span>
          </span>
        </Link>
      </div>
    </div>
  );
}
