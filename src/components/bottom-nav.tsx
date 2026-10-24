"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import * as React from "react";
import { activeTab, choosePracticeRoute, PRACTICE_LAST_CHANGE_EVENT, type PracticeType } from "@/lib/nav";

/**
 * Bottom navigation icons from Lucide (https://lucide.dev)
 * ISC License - Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022
 * as part of Feather. All other copyright for Lucide are held by Lucide Contributors 2022.
 */
const Icons = {
  // calendar from Lucide
  Today: () => (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </svg>
  ),
  // activity from Lucide
  Practice: () => (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
    </svg>
  ),
  // history from Lucide (clock-rotate-left)
  History: () => (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  ),
  // trending-up from Lucide
  Progress: () => (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  ),
  // settings from Lucide
  Settings: () => (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
};

const TABS = [
  { href: "/today", label: "Today", Icon: Icons.Today },
  { href: "/practice", label: "Practice", Icon: Icons.Practice },
  { href: "/history", label: "History", Icon: Icons.History },
  { href: "/progress", label: "Progress", Icon: Icons.Progress },
  { href: "/settings", label: "Settings", Icon: Icons.Settings },
];

/**
 * The tab bar, mounted once in the root layout.
 *
 * It used to be rendered inside each page, which meant it was part of the
 * segment Next.js swaps on navigation: the bar was destroyed and rebuilt on
 * every tab change, and the active tab could not move until the new page's
 * HTML came back from the server. Living in the root layout it stays mounted
 * for the life of the session, and `usePathname()` updates the highlight on
 * the tap rather than on the response — which is most of what makes a tab
 * change feel instant.
 *
 * Yoga and Breathe are combined into one "Practice" tab because 6 tabs at
 * 390px would be too cramped (65px per tab). Practice is the shared concept:
 * both are intentional movement/breath work, distinguished from strength
 * training on Today.
 */
function subscribe(callback: () => void) {
  // Listen to 'storage' events (fired in other tabs when localStorage changes)
  // and 'practice:last-change' (fired in this tab when setLastPractice writes)
  window.addEventListener("storage", callback);
  window.addEventListener(PRACTICE_LAST_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(PRACTICE_LAST_CHANGE_EVENT, callback);
  };
}

function getLastPracticeSnapshot(): PracticeType | null {
  try {
    const stored = localStorage.getItem("practice:last");
    return stored === "breathe" || stored === "yoga" ? stored : null;
  } catch {
    return null;
  }
}

function getLastPracticeServerSnapshot(): PracticeType | null {
  return null;
}

export function BottomNav() {
  const pathname = usePathname();
  const active = activeTab(pathname);
  
  const lastPractice = useSyncExternalStore(
    subscribe,
    getLastPracticeSnapshot,
    getLastPracticeServerSnapshot
  );
  
  // Hide nav on offline page (marked with data-offline attribute)
  // Use layoutEffect to check synchronously before paint
  const [isOffline, setIsOffline] = React.useState(false);
  
  React.useLayoutEffect(() => {
    const hasOfflineMarker = document.querySelector('[data-offline="true"]');
    setIsOffline(!!hasOfflineMarker); // eslint-disable-line react-hooks/set-state-in-effect
  }, [pathname]);
  
  if (!active || isOffline) return null;

  // Map /practice to the appropriate destination using choice logic
  const getHref = (tabHref: string) => {
    if (tabHref !== "/practice") return tabHref;
    return choosePracticeRoute(pathname, lastPractice);
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {TABS.map((t) => {
          const href = getHref(t.href);
          const isActive = active === t.href;
          const Icon = t.Icon;
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={href}
                // Default (automatic) prefetching on purpose, not prefetch={true}.
                // Automatic fetches only the destination's loading skeleton, so a
                // tap paints instantly and the data follows. prefetch={true} would
                // fetch all tabs in full on every screen — and rendering Today is
                // not free of consequences: it is where a finished four-week block
                // rolls over into the next one, and the user would then never see
                // the "Block N starts today" message, because the rollover would
                // already have happened in a prefetch they never asked for.
                aria-current={isActive ? "page" : undefined}
                // px-1: five labels have to fit a 375px screen.
                className={`flex flex-col items-center gap-1 px-1 pt-2.5 text-center transition-colors ${
                  isActive ? "text-accent" : "text-muted"
                }`}
                style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
              >
                <Icon />
                <span className="text-[11px] font-medium leading-none">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
