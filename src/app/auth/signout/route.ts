import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * POST-only sign-out route.
 *
 * This is kept for backwards compatibility with existing forms that POST here.
 * New code should prefer the signOutAction server action for better error
 * handling and loading states.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(_request: Request) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    // If signOut fails, return a 500 response.
    // Forms that POST here won't see this error in the UI, but at least they
    // won't be redirected as if signed out.
    return new NextResponse(error.message, { status: 500 });
  }

  // After signOut completes and cookies are cleared, redirect.
  // The redirect must happen via Next.js's redirect() to ensure the cleared
  // cookies are included in the response.
  redirect("/");
}
