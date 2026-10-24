import { notFound } from "next/navigation";
import { isUuid } from "./ids";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPractice } from "@/app/breathe/load";

/**
 * Validate a session route parameter and verify the session exists.
 *
 * This runs in layout.tsx BEFORE streaming begins, ensuring proper 404
 * status codes for invalid or nonexistent session IDs.
 *
 * @param supabase - Supabase client (must have user context for RLS)
 * @param userId - Current user ID for explicit filtering
 * @param id - Route parameter from params.id
 * @returns 'ok' if session exists, 'not_found' if malformed or missing
 */
export async function checkSessionRoute(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<"ok" | "not_found"> {
  if (!isUuid(id)) {
    return "not_found";
  }

  const { data, error } = await supabase
    .from("sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? "ok" : "not_found";
}

/**
 * Validate a breathing practice slug and verify it resolves.
 *
 * This runs in layout.tsx BEFORE streaming begins, ensuring proper 404
 * status codes for invalid or nonexistent practice slugs.
 *
 * Uses the loadPractice loader which handles:
 * - Built-in patterns by slug
 * - User's own patterns (mine-<id>)
 * - User's retimed built-in patterns (findPatternByLogKey)
 *
 * @param supabase - Supabase client (must have user context for RLS)
 * @param userId - Current user ID
 * @param slug - Route parameter from params.slug
 * @param loader - Optional loader function for testing (defaults to loadPractice)
 * @returns 'ok' if practice exists, 'not_found' if unknown slug
 */
export async function checkBreatheRoute(
  supabase: SupabaseClient,
  userId: string,
  slug: string,
  loader: typeof loadPractice = loadPractice,
): Promise<"ok" | "not_found"> {
  const loaded = await loader(supabase, userId, slug);
  return loaded ? "ok" : "not_found";
}

/**
 * Guard helper that calls notFound() when check fails.
 * Use this in layout.tsx to validate before rendering children.
 * Works for both /session/[id] and /history/[id] routes.
 */
export async function guardSessionRoute(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<void> {
  const result = await checkSessionRoute(supabase, userId, id);
  if (result === "not_found") {
    notFound();
  }
}

/**
 * Alias for guardSessionRoute - history detail uses the same sessions table.
 */
export const guardHistoryRoute = guardSessionRoute;

/**
 * Guard helper that calls notFound() when check fails.
 * Use this in layout.tsx to validate before rendering children.
 */
export async function guardBreatheRoute(
  supabase: SupabaseClient,
  userId: string,
  slug: string,
): Promise<void> {
  const result = await checkBreatheRoute(supabase, userId, slug);
  if (result === "not_found") {
    notFound();
  }
}
