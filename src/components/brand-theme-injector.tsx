"use client";

import { useEffect } from "react";
import { branding, getBrandCssVariables } from "@/lib/branding";

/**
 * Brand Theme Injector
 *
 * Injects the active brand's color palette as CSS variables into the document.
 * This allows Tailwind classes like `bg-accent` to use the configured brand
 * colors without hardcoding hex values throughout the codebase.
 *
 * Runs client-side only to avoid hydration mismatches if NEXT_PUBLIC_BRAND
 * differs between build and runtime (though this should not happen in practice).
 */
export function BrandThemeInjector() {
  useEffect(() => {
    // Inject brand CSS variables into document root
    const root = document.documentElement;
    const vars = getBrandCssVariables(branding);

    // Parse and apply each CSS variable
    const lines = vars.split("\n").filter((line) => line.trim());
    for (const line of lines) {
      const match = line.match(/^(--[\w-]+):\s*(.+);$/);
      if (match) {
        const [, property, value] = match;
        root.style.setProperty(property, value);
      }
    }
  }, []);

  return null;
}
