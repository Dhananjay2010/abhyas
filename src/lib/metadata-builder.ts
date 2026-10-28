/**
 * Build metadata from runtime brand.
 * Pure function extracted from layout for testability.
 */

import type { Metadata } from "next";
import type { Brand } from "./branding";
import { branding } from "./branding";

export function buildMetadata(brand: Brand): Metadata {
  return {
    metadataBase: new URL(branding.siteUrl),
    title: brand.name,
    description: branding.description,
    applicationName: brand.name,
    appleWebApp: {
      capable: true,
      title: brand.shortName,
      statusBarStyle: "black-translucent",
    },
    icons: {
      icon: [
        { url: branding.icons.favicon, sizes: "32x32" },
        { url: branding.icons.icon192, sizes: "192x192", type: "image/png" },
        { url: branding.icons.icon512, sizes: "512x512", type: "image/png" },
      ],
      apple: {
        url: branding.icons.appleTouchIcon,
        sizes: "180x180",
        type: "image/png",
      },
    },
    manifest: "/manifest.webmanifest",
    openGraph: {
      type: "website",
      siteName: brand.name,
      title: brand.name,
      description: branding.description,
      url: branding.siteUrl,
    },
  };
}
