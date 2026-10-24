/**
 * Cached profile queries.
 *
 * Profile data (timezone, preferences) changes infrequently and is read by
 * multiple components per request. React's `cache()` deduplicates these
 * fetches within a single render.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/auth";

/**
 * Get the user's timezone. Deduplicated per-request via React cache().
 * Many actions need the timezone to compute local dates, and this ensures
 * they don't each fetch the profile independently.
 */
export const getCachedUserTimezone = cache(async (): Promise<string> => {
  const user = await getSessionUser();
  if (!user) return "Asia/Kolkata";

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();

  return data?.timezone || "Asia/Kolkata";
});
