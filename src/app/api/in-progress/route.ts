import { NextResponse } from "next/server";
import { getAuthedClient } from "@/lib/supabase/auth";
import { getInProgressSession } from "@/lib/session/in-progress";

export const dynamic = "force-dynamic";

/**
 * GET /api/in-progress
 *
 * Returns the user's in-progress session for today, if one exists.
 *
 * L1: Client-side route handler so the resume bar can fetch on mount and
 * pathname changes without making root layout dynamic.
 *
 * Timezone resolution: Profile timezone wins, browser timezone (?tz=) is fallback,
 * system default is final fallback. Never hardcoded to UTC.
 *
 * Returns 401 if unauthenticated, 200 with { session } if found,
 * 200 with { session: null } if not found.
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

  const url = new URL(request.url);
  const timezone = url.searchParams.get("tz") || "UTC";

  const session = await getInProgressSession(supabase, user.id, timezone);

  return NextResponse.json(
    { session },
    { headers: { "Cache-Control": "no-store" } }
  );
}
