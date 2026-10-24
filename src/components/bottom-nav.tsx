"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeTab } from "@/lib/nav";

/**
 * Inline SVG icons for the bottom navigation.
 * Simple, minimal shapes to avoid adding a new icon dependency.
 */
const Icons = {
  Today: () => (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="14" height="14" rx="2" />
      <line x1="3" y1="8" x2="17" y2="8" />
      <line x1="10" y1="12" x2="10" y2="14" />
    </svg>
  ),
  Practice: () => (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l2 2" />
    </svg>
  ),
  History: () => (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10h7l3-3" />
      <circle cx="10" cy="10" r="7" />
    </svg>
  ),
  Progress: () => (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3,15 7,11 11,13 17,7" />
      <polyline points="13,7 17,7 17,11" />
    </svg>
  ),
  Settings: () => (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="3" />
      <path d="M16 10a6 6 0 00-.5-2.4l1.7-1-1-1.7-2 .3a6 6 0 00-1.7-1.7l.3-2-1.7-1-1 1.7A6 6 0 008 2.7V1H6v1.7a6 6 0 00-2.4.5l-1-1.7-1.7 1 .3 2a6 6 0 00-1.7 1.7l-2-.3-1 1.7 1.7 1A6 6 0 002 10h-.7v2h.7a6 6 0 00.5 2.4l-1.7 1 1 1.7 2-.3a6 6 0 001.7 1.7l-.3 2 1.7 1 1-1.7A6 6 0 0010 17.3V19h2v-1.7a6 6 0 002.4-.5l1 1.7 1.7-1-.3-2a6 6 0 001.7-1.7l2 .3 1-1.7-1.7-1A6 6 0 0018 10z" />
    </svg>
  ),
};

const TABS = [
  { href: "/today", label: "Today", icon: Icons.Today },
  { href: "/practice", label: "Practice", icon: Icons.Practice },
  { href: "/history", label: "History", icon: Icons.History },
  { href: "/progress", label: "Progress", icon: Icons.Progress },
  { href: "/settings", label: "Settings", icon: Icons.Settings },
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
export function BottomNav() {
  const pathname = usePathname();
  const active = activeTab(pathname);
  if (!active) return null;

  // Map /practice to the appropriate destination based on current path
  const getHref = (tabHref: string) => {
    if (tabHref !== "/practice") return tabHref;
    
    // If we're on a yoga page, stay in yoga
    if (pathname === "/yoga" || pathname.startsWith("/yoga/")) {
      return "/yoga";
    }
    
    // Otherwise default to breathe
    return "/breathe";
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {TABS.map((t) => {
          const Icon = t.icon;
          const href = getHref(t.href);
          const isActive = active === t.href;
          
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
                className={`flex flex-col items-center gap-1 px-1 pt-2 text-center text-xs font-medium transition-colors ${
                  isActive ? "text-accent" : "text-muted"
                }`}
                style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
              >
                <Icon />
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
