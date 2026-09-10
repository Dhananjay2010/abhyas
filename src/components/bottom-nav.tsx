"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/today", label: "Today" },
  { href: "/history", label: "History" },
  { href: "/progress", label: "Progress" },
  { href: "/settings", label: "Settings" },
];

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
  // Yoga and breathing are reached from Today and belong to it.
  [(p) => p === "/yoga" || p === "/breathe", "/today"],
  // The dev harnesses preview real screens, so they keep the real chrome —
  // and light up the tab whose screen they are previewing.
  [(p) => p.startsWith("/dev/"), ""],
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
  const match = ACTIVE_FOR.find(([test]) => test(pathname));
  if (!match) return null;
  const active =
    match[1] ||
    TABS.find((t) => pathname.startsWith(`/dev${t.href}`))?.href ||
    "/today";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {TABS.map((t) => (
          <li key={t.href} className="flex-1">
            <Link
              href={t.href}
              prefetch
              aria-current={active === t.href ? "page" : undefined}
              className={`block px-4 pt-3 text-center text-sm font-medium transition-colors ${
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
