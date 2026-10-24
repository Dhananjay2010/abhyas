/**
 * Version endpoint for deploy mismatch detection.
 *
 * Returns the current build's git SHA for client-side version checking.
 * The client compares its baked-in SHA with this endpoint on focus/visibility
 * change and every 5 minutes to detect when a new version has been deployed.
 *
 * Uses VERCEL_GIT_COMMIT_SHA with fallback to NEXT_PUBLIC_BUILD_SHA (set at
 * build time in next.config.ts) and finally 'dev' in development.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getBuildVersion(): string {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    process.env.NEXT_PUBLIC_BUILD_SHA ||
    "dev"
  );
}

export async function GET() {
  const version = getBuildVersion();
  
  return NextResponse.json(
    { version },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
