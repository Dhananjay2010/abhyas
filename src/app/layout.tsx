import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/bottom-nav";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { NewVersionHint } from "@/components/new-version-hint";
import { branding } from "@/lib/branding";
import { layoutDeps } from "@/app/layout-deps";
import { OfflineErrorProvider } from "@/contexts/offline-error-context";
import { InProgressBar } from "@/components/in-progress-bar";
import { PendingSetReplayProvider } from "@/components/pending-set-replay-provider";
import { HostWinsNotice } from "@/components/host-wins-notice";
import { createClient } from "@/lib/supabase/server";
import { getUserGymMembership } from "@/lib/gym/member-gym";
import { getHostWinsNoticeProps } from "@/lib/host-wins-logic";
import { getRequestBrandResolution } from "@/lib/runtime-brand";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

async function getHostWinsNoticePropsForLayout() {
  const resolution = await getRequestBrandResolution();
  
  // Get user's gym membership (reuse cached resolution data)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const memberGym = user ? await getUserGymMembership(supabase, user.id) : null;
  
  // Use pure function to determine notice props
  return getHostWinsNoticeProps(resolution, memberGym);
}

export async function generateMetadata(): Promise<Metadata> {
  return layoutDeps.getRootLayoutMetadataForRequest();
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
  const brandCssVars = await layoutDeps.getRootLayoutBrandCssForRequest();
  const noticeProps = await getHostWinsNoticePropsForLayout();

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
