import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/bottom-nav";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Abhyas",
  description:
    "One hour a day. Abhyas tells you exactly what to train, guides you through it, and makes next week harder than this one.",
  applicationName: "Abhyas",
  appleWebApp: { capable: true, title: "Abhyas", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0a0c0e",
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
