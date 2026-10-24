import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/bottom-nav";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { NewVersionHint } from "@/components/new-version-hint";
import { branding, getBrandCssVariables } from "@/lib/branding";
import { OfflineErrorProvider } from "@/contexts/offline-error-context";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  metadataBase: new URL(branding.siteUrl),
  title: branding.name,
  description: branding.description,
  applicationName: branding.name,
  appleWebApp: {
    capable: true,
    title: branding.shortName,
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
    siteName: branding.name,
    title: branding.name,
    description: branding.description,
    url: branding.siteUrl,
  },
};

export const viewport: Viewport = {
  themeColor: branding.colors.bg,
  width: "device-width",
  initialScale: 1,
  // Zoom re-enabled (i10/k6): removed maximumScale for accessibility (WCAG 1.4.4)
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Inject brand CSS variables on the server to avoid flash of default theme.
  // NEXT_PUBLIC_BRAND is build-time, so no hydration mismatch.
  const brandCssVars = getBrandCssVariables(branding);

  return (
    <html lang="en" className={inter.variable}>
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: `:root { ${brandCssVars} }`,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <OfflineErrorProvider>
          <ServiceWorkerRegistration />
          <NewVersionHint />
          {children}
          {/*
            Mounted once, outside every page, so a tab change swaps only the
            content beneath it. The bar itself never unmounts and its active tab
            moves the moment the link is tapped.
          */}
          <BottomNav />
        </OfflineErrorProvider>
      </body>
    </html>
  );
}
