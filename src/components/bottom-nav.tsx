"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { activeTab, choosePracticeRoute, needsNotFoundNav, PRACTICE_LAST_CHANGE_EVENT, type PracticeType } from "@/lib/nav";
import { useOfflineError } from "@/contexts/offline-error-context";

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
      <polyline points="12 7 12 12 15 15" />
    </svg>
  ),
  // bar-chart-2 from Lucide
  Progress: () => (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" x2="18" y1="20" y2="10" />
      <line x1="12" x2="12" y1="20" y2="4" />
      <line x1="6" x2="6" y1="20" y2="14" />
    </svg>
  ),
  // user from Lucide
  Profile: () => (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
};

const TABS = [
  { href: "/today", label: "Today", Icon: Icons.Today },
  { href: "/practice", label: "Practice", Icon: Icons.Practice },
  { href: "/history", label: "History", Icon: Icons.History },
  { href: "/progress", label: "Progress", Icon: Icons.Progress },
  { href: "/settings", label: "Profile", Icon: Icons.Profile },
] as const;

// ---- Practice choice persistence

let lastSnapshot: PracticeType | null = null;
const subscribers = new Set<() => void>();

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function getLastPracticeSnapshot(): PracticeType | null {
  return lastSnapshot;
}

export function setLastPractice(practice: PracticeType) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("practice:last", practice);
    lastSnapshot = practice;
    subscribers.forEach((cb) => cb());
    window.dispatchEvent(new Event(PRACTICE_LAST_CHANGE_EVENT));
  } catch {
    // Ignore storage errors
  }
}

if (typeof window !== "undefined") {
  try {
    lastSnapshot = (localStorage.getItem("practice:last") as PracticeType | null) || null;
  } catch {
    // Ignore storage errors
  }
}

function getLastPracticeServerSnapshot(): PracticeType | null {
  return null;
}

export function BottomNav({ forNotFound }: { forNotFound?: boolean } = {}) {
  const pathname = usePathname();
  const active = activeTab(pathname);
  const { isOfflineError } = useOfflineError();

  const lastPractice = useSyncExternalStore(
    subscribe,
    getLastPracticeSnapshot,
    getLastPracticeServerSnapshot
  );

  if (forNotFound ? !needsNotFoundNav(pathname) : !active) return null;

  if (isOfflineError) return null;

  // Map /practice to the appropriate destination using choice logic
  const getHref = (tabHref: string) => {
    if (tabHref !== "/practice") return tabHref;
    return choosePracticeRoute(pathname, lastPractice);
  };

  return (
    <nav data-bottom-nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur">
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
                className={`relative flex flex-col items-center gap-1 px-1 pt-2.5 text-center transition-colors ${
                  isActive ? "text-accent" : "text-muted"
                }`}
                style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-full bg-accent"
                  />
                )}
                <Icon />
                <span className={`text-[11px] leading-none ${isActive ? "font-semibold" : "font-medium"}`}>
                  {t.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
