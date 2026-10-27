import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/bottom-nav";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { NewVersionHint } from "@/components/new-version-hint";
import { branding } from "@/lib/branding";
import { getRequestBrandResolution, getBrandCssVariablesForBrand } from "@/lib/runtime-brand";
import { OfflineErrorProvider } from "@/contexts/offline-error-context";
import { InProgressBar } from "@/components/in-progress-bar";
import { PendingSetReplayProvider } from "@/components/pending-set-replay-provider";
import { HostWinsNotice } from "@/components/host-wins-notice";
import { createClient } from "@/lib/supabase/server";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

async function getHostWinsNoticeProps(): Promise<{ userGymName: string | null; hostGymName: string | null }> {
  const resolution = await getRequestBrandResolution();
  
  // Only show notice in tier "host" (host wins)
  if (resolution.tier !== "host") {
    return { userGymName: null, hostGymName: null };
  }
  
  // Get user's gym
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let userGymName: string | null = null;
  
  if (user) {
    const { data: membership } = await supabase
      .from("gym_memberships")
      .select(`gyms (name)`)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();
    
    if (membership) {
      const gym = Array.isArray(membership.gyms) ? membership.gyms[0] : membership.gyms;
      userGymName = gym?.name ?? null;
    }
  }
  
  // Host gym name comes from resolution
  const hostGymName = resolution.gymName;
  
  // Only show if user has a gym AND it differs from host gym
  if (!userGymName || !hostGymName || userGymName === hostGymName) {
    return { userGymName: null, hostGymName: null };
  }
  
  return { userGymName, hostGymName };
}

export async function generateMetadata(): Promise<Metadata> {
  const resolution = await getRequestBrandResolution();
  const brand = resolution.brand;
  
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

export const viewport: Viewport = {
  themeColor: branding.colors.bg,
  width: "device-width",
  initialScale: 1,
  // Zoom re-enabled (i10/k6): removed maximumScale for accessibility (WCAG 1.4.4)
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Inject brand CSS variables on the server to avoid flash of default theme.
  // Runtime brand is resolved from the request host.
  const resolution = await getRequestBrandResolution();
  const brand = resolution.brand;
  const brandCssVars = getBrandCssVariablesForBrand(brand);
  const noticeProps = await getHostWinsNoticeProps();

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
          <PendingSetReplayProvider />
          <HostWinsNotice {...noticeProps} />
          {children}
          {/*
            L1: Client-side in-progress session indicator that fetches on mount
            and pathname changes. Shows above the bottom nav when the user has a
            workout that was started but not finished. Hidden while loading,
            logged out, or on /session/* routes. Root layout does no request-time
            data fetching so /, /privacy, /terms, and /offline stay static.
          */}
          <InProgressBar />
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
