import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/bottom-nav";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { branding } from "@/lib/branding";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
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
};

export const viewport: Viewport = {
  themeColor: branding.themeColor,
  width: "device-width",
  initialScale: 1,
  // The guided session has fixed controls; zooming breaks the layout mid-set.
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        <ServiceWorkerRegistration />
        {children}
        {/*
          Mounted once, outside every page, so a tab change swaps only the
          content beneath it. The bar itself never unmounts and its active tab
          moves the moment the link is tapped.
        */}
        <BottomNav />
      </body>
    </html>
  );
}
