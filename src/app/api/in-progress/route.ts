import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/supabase/auth";
import { getInProgressSession } from "@/lib/session/in-progress";

export const dynamic = "force-dynamic";

/**
 * GET /api/in-progress
 *
 * Returns the user's in-progress session, if one exists and is not stale.
 *
 * L1: Client-side route handler so the resume bar can fetch on mount and
 * pathname changes without making root layout dynamic.
 *
 * Staleness: applies #111's exact rule (>= 6h inactive or superseded by a newer
 * strength session). Stale sessions are filtered out without closing them.
 *
 * Returns 401 if unauthenticated, 200 with { session } if found,
 * 200 with { session: null } if not found or stale.
 *
 * All responses include Cache-Control: no-store.
 */
export async function GET(request: Request) {
  const { supabase, user } = await getAuthedClient();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { 
        status: 401,
        headers: { "Cache-Control": "no-store" }
      }
    );
  }

  const session = await getInProgressSession(supabase, user.id);

  return NextResponse.json(
    { session },
    { headers: { "Cache-Control": "no-store" } }
  );
}
