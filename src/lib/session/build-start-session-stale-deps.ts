import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { 
  closeStaleSessionsCore,
  type OpenSession 
} from "./close-stale";
import { 
  buildCloseStaleDeps,
  supabaseCloseStaleQueries
} from "./close-stale-deps";
import type { StartSessionStaleDeps } from "./start-session-stale-core";

/**
 * Build StartSessionStaleDeps for actions.ts from Supabase client and open sessions.
 * 
 * Extracted from actions.ts to make it testable without 'use server' constraints.
 * Tests can inject a real createClient<Database> with stub fetch (fake PostgREST)
 * and call the real closeStaleSessionsCore with an injected clock.
 * 
 * @param nowMs - Required clock for deterministic testing (use Date.now() in production)
 */
export function buildStartSessionStaleDeps(
  supabase: SupabaseClient<Database>,
  userId: string,
  openSessions: OpenSession[],
  today: string,
  nowMs: number
): StartSessionStaleDeps {
  return {
    today,
    readOpenSessions: async () => openSessions,
    closeStaleSessions: async (sessions, date) => {
      // Always use closeStaleSessionsCore with injected clock for testability
      const queries = supabaseCloseStaleQueries(supabase);
      const deps = buildCloseStaleDeps(queries);
      return await closeStaleSessionsCore(deps, sessions, nowMs, date);
    },
    checkRemainingInProgress: async () => {
      // Check for ANY in_progress session (regardless of date) after closing stale ones.
      // This catches fresh cross-date sessions (< 6h) that weren't closed.
      const { data, error } = await supabase
        .from("sessions")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "in_progress")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        return { ok: false, error: error.message };
      }
      return { ok: true, sessionId: data?.id ?? null };
    },
  };
}
