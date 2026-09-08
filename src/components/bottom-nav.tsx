import Link from "next/link";

const TABS = [
  { href: "/today", label: "Today" },
  { href: "/history", label: "History" },
  { href: "/progress", label: "Progress" },
  { href: "/settings", label: "Settings" },
];

export function BottomNav({ active }: { active: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {TABS.map((t) => (
          <li key={t.href} className="flex-1">
            <Link
              href={t.href}
              aria-current={active === t.href ? "page" : undefined}
              className={`block px-4 pt-3 text-center text-sm font-medium ${
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
