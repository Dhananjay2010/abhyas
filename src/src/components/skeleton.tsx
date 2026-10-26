/**
 * Placeholder shapes for loading states.
 *
 * These exist so a tap paints something within a frame instead of leaving the
 * previous screen on display. They are deliberately shaped like the real
 * content — same page padding, same heading size, same card heights — so the
 * real content lands in place rather than shoving the skeleton aside.
 */

export function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-2 ${className}`} />;
}

export function Card({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-xl border border-border bg-surface ${className}`} />
  );
}

/**
 * The page frame every tab shares: max-width column, the same padding, and the
 * bottom clearance for the tab bar.
 */
export function ScreenSkeleton({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <main
      className="mx-auto w-full max-w-md px-6 py-10 pb-28"
      aria-busy="true"
      aria-live="polite"
    >
      {/* The real heading, not a grey bar: we already know what it says, and
          showing it immediately is what makes the tap feel answered. */}
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <span className="sr-only">Loading…</span>
      {children}
    </main>
  );
}
