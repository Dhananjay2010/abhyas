import { branding } from "@/lib/branding";
import Image from "next/image";

/**
 * Brand logo component.
 * Shows the configured logo image if available, otherwise renders the brand name as text.
 * Used in headers and anywhere the app displays its brand identity.
 */
export function BrandLogo({ className }: { className?: string }) {
  if (branding.logo) {
    return (
      <Image
        src={branding.logo}
        alt={branding.name}
        width={48}
        height={48}
        className={className}
        style={{ objectFit: "contain" }}
      />
    );
  }

  // Fallback to text name when no logo is configured
  return <span className={className}>{branding.name}</span>;
}
