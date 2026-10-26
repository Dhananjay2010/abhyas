import Link from "next/link";
import { getSiteInfo } from "@/lib/legal/site-info";

/**
 * Site-wide footer with medical disclaimer and legal links.
 * 
 * Appears on pages where the bottom nav is NOT shown (landing, onboarding, legal pages).
 * The bottom nav itself includes padding for safe-area-inset-bottom on pages where it's present.
 */
export function Footer() {
  const { appName, supportEmail } = getSiteInfo();
  
  return (
    <footer className="border-t border-border bg-surface/95 px-6 py-6 text-center text-xs text-muted">
      <p className="leading-relaxed">
        {appName} gives general fitness guidance, not medical advice. Talk to a
        doctor before starting if you have any health condition or injury.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
        <Link href="/privacy" className="hover:text-fg transition-colors">
          Privacy Policy
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/terms" className="hover:text-fg transition-colors">
          Terms of Service
        </Link>
        <span aria-hidden="true">·</span>
        <a 
          href={`mailto:${supportEmail}`} 
          className="hover:text-fg transition-colors"
        >
          Support
        </a>
      </div>
    </footer>
  );
}
