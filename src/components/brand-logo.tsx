import { branding, type Brand } from "@/lib/branding";
import Image from "next/image";

/**
 * Brand logo component.
 * Shows the configured logo image if available, otherwise renders the brand name as text.
 * Used in headers and anywhere the app displays its brand identity.
 * 
 * @param brand - Brand to display (defaults to static branding for backward compatibility)
 */
export function BrandLogo({ brand = branding, className }: { brand?: Brand; className?: string }) {
  if (brand.logo) {
    return (
      <Image
        src={brand.logo}
        alt={brand.name}
        width={48}
        height={48}
        className={className}
        style={{ objectFit: "contain" }}
      />
    );
  }

  // Fallback to text name when no logo is configured
  return <span className={className}>{brand.name}</span>;
}
