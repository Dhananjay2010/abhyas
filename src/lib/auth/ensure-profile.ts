import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

/**
 * Enough of a user to build a profile from.
 *
 * Structural rather than Supabase's `User`, because the two callers hold
 * different things: the auth callback has the full user with Google's metadata
 * on it, while a page only has the verified claims -- id and email -- since
 * `getClaims()` deliberately avoids the round trip that would fetch more. A
 * profile created from claims alone gets its display name from the email, and
 * onboarding asks for the real one on the first screen regardless.
 */
export type ProfileSeed = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

/**
 * Make sure this user has the two rows the whole application assumes.
 *
 * Around thirty queries read `profiles` with `.single()` and treat a missing
 * row as impossible. That assumption is reasonable; resting it on a single
 * trigger in a schema the platform owns is not.
 *
 * `on_auth_user_created` on `auth.users` is the primary mechanism and still
 * does the work on a healthy database. It went missing when the database moved
 * to Mumbai: `handle_new_user()` lives in `public` and came across in the
 * schema dump, while Supabase rebuilt the `auth` schema from its own baseline
 * and the trigger went with it. Every signup for the next three days got an
 * auth user and no profile, and `/today` answered with a blank page carrying
 * nothing but "Minified React error #441" -- because a server render that
 * throws shows the user nothing at all in production.
 *
 * So this runs from the auth callback as well. It is redundant when the trigger
 * is healthy, which is exactly the point: the app should not be the only thing
 * that notices when the trigger is not.
 *
 * Both writes ignore conflicts, so a returning user's display name is never
 * overwritten by whatever Google last said about them.
 */
export async function ensureProfileRows(supabase: Client, user: ProfileSeed): Promise<void> {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : null);

  await Promise.all([
    supabase.from("profiles").upsert(
      {
        id: user.id,
        display_name:
          str("full_name") ?? str("name") ?? (user.email ?? "").split("@")[0] ?? null,
        avatar_url: str("avatar_url") ?? str("picture"),
      },
      { onConflict: "id", ignoreDuplicates: true },
    ),
    supabase
      .from("user_settings")
      .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true }),
  ]);
}
