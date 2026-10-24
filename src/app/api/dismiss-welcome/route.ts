import { cookies } from "next/headers";
import { getAuthedClient } from "@/lib/supabase/auth";
import { NextResponse } from "next/server";

export async function POST() {
  const { user } = await getAuthedClient();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Set cookie keyed per user
  const cookieStore = await cookies();
  cookieStore.set(`abhyas_welcome_dismissed_${user.id}`, "true", {
    maxAge: 60 * 60 * 24 * 365, // 1 year
    path: "/",
    sameSite: "lax",
  });

  return NextResponse.json({ ok: true });
}
