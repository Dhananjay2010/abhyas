"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/today", label: "Today" },
  { href: "/breathe", label: "Breathe" },
  { href: "/history", label: "History" },
  { href: "/progress", label: "Progress" },
  { href: "/settings", label: "Settings" },
];

/**
 * The Breathe tab and a practice's setup page, but not the practice itself
 * (`/breathe/<slug>/session`). That is full screen, so it is left off the
 * allowlist and the bar disappears while you breathe.
 */
const BREATHE_PAGE = /^\/breathe(\/[^/]+)?$/;
const DEV_BREATHE_PAGE = /^\/dev\/breathe(\/[^/]+)?$/;

/**
 * Routes that show the tab bar, and which tab each one lights up.
 *
 * An allowlist rather than a list of exclusions: a new full-screen route (a
 * guided session, an onboarding step) should never have to remember to opt out
 * of the nav to render correctly.
 */
const ACTIVE_FOR: Array<[test: (p: string) => boolean, tab: string]> = [
  [(p) => p === "/today", "/today"],
  [(p) => p === "/history" || p.startsWith("/history/"), "/history"],
  [(p) => p === "/progress", "/progress"],
  [(p) => p === "/settings", "/settings"],
  [(p) => BREATHE_PAGE.test(p), "/breathe"],
  // Yoga is reached from Today and belongs to it.
  [(p) => p === "/yoga", "/today"],
  // Dev harnesses that preview a tabbed screen keep the real chrome, so what
  // they show matches what ships. The harnesses for full-screen routes — the
  // guided session and onboarding — are deliberately absent, because those
  // routes have no tab bar either.
  [(p) => p === "/dev/history", "/history"],
  [(p) => p === "/dev/settings", "/settings"],
  [(p) => p === "/dev/charts", "/progress"],
  [(p) => DEV_BREATHE_PAGE.test(p), "/breathe"],
  [(p) => p === "/dev/yoga" || p === "/dev/loading-states", "/today"],
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
 */
export function BottomNav() {
  const pathname = usePathname();
  const active = ACTIVE_FOR.find(([test]) => test(pathname))?.[1];
  if (!active) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {TABS.map((t) => (
          <li key={t.href} className="flex-1">
            <Link
              href={t.href}
              // Default (automatic) prefetching on purpose, not prefetch={true}.
              // Automatic fetches only the destination's loading skeleton, so a
              // tap paints instantly and the data follows. prefetch={true} would
              // fetch all four tabs in full on every screen — and rendering
              // Today is not free of consequences: it is where a finished
              // four-week block rolls over into the next one, and the user would
              // then never see the "Block N starts today" message, because the
              // rollover would already have happened in a prefetch they never
              // asked for.
              aria-current={active === t.href ? "page" : undefined}
              // px-1: five labels have to fit a 375px screen.
              className={`block px-1 pt-3 text-center text-sm font-medium transition-colors ${
                active === t.href ? "text-accent" : "text-muted"
              }`}
              style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
