"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Segmented control to switch between Breathe and Yoga.
 * Shown at the top of /breathe and /yoga pages to make Yoga discoverable
 * when both are combined into one Practice tab.
 * 
 * Uses localStorage to remember the last visited practice.
 */
export function PracticeSwitch() {
  const pathname = usePathname();
  
  // Determine which practice we're on
  const isYoga = pathname === "/yoga" || pathname.startsWith("/yoga/");
  const isBreathe =
    pathname === "/breathe" ||
    pathname.match(/^\/breathe\/(?:routine|journey)\/[^/]+$/) ||
    pathname.match(/^\/breathe\/[^/]+$/);

  // Save to localStorage when visiting either practice
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    try {
      if (isYoga) {
        localStorage.setItem("practice:last", "yoga");
      } else if (isBreathe) {
        localStorage.setItem("practice:last", "breathe");
      }
    } catch {
      // localStorage may be disabled
    }
  }, [isYoga, isBreathe]);

  return (
    <div
      role="group"
      aria-label="Practice type"
      className="flex gap-1 rounded-xl bg-surface-2 p-1"
    >
      <Link
        href="/breathe"
        aria-current={isBreathe ? "page" : undefined}
        className={`flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-medium transition-colors ${
          isBreathe ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"
        }`}
        style={{ minHeight: "44px", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        Breathe
      </Link>
      <Link
        href="/yoga"
        aria-current={isYoga ? "page" : undefined}
        className={`flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-medium transition-colors ${
          isYoga ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"
        }`}
        style={{ minHeight: "44px", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        Yoga
      </Link>
    </div>
  );
}
