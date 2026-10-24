"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { InProgressSession } from "@/lib/session/in-progress";

export function InProgressBar({ session }: { session: InProgressSession }) {
  const pathname = usePathname();

  // Hide on /session/* routes (user is already in the session)
  if (pathname.startsWith("/session/")) {
    return null;
  }

  const setsText =
    session.workingSetsLogged === 1
      ? "1 set logged"
      : `${session.workingSetsLogged} sets logged`;

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
          <span className="flex items-center justify-between gap-3">
            <span className="truncate">
              Workout in progress · {session.title} · {setsText}
            </span>
            <span className="shrink-0 font-semibold">Resume</span>
          </span>
        </Link>
      </div>
    </div>
  );
}
