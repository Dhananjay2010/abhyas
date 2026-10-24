/**
 * Idempotent session start.
 * 
 * If an in_progress session already exists for that user and local day,
 * return it instead of inserting a new one.
 * 
 * This prevents duplicate sessions when Today briefly shows 'Start session'
 * instead of 'Resume' after leaving a workout (case B1-C).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type SessionStatus = Database["public"]["Enums"]["session_status"];

export type ExistingSession = {
  id: string;
  status: SessionStatus;
  localDate: string;
  actualType: string | null;
  startedAt: string | null;
};

export type StartSessionCoreInput = {
  supabase: SupabaseClient<Database>;
  userId: string;
  programId: string;
  programDayId: string;
  localDate: string;
  weekInBlock: number;
  isDeload: boolean;
  dayType: Database["public"]["Enums"]["day_type"];
};

export type StartSessionCoreResult =
  | { ok: true; sessionId: string; existed: boolean }
  | { ok: false; error: string };

/**
 * Idempotent session start.
 * 
 * Checks for an existing in_progress session for this user + local date.
 * If found, returns it. If not, creates a new one.
 * 
 * Handles 23505 unique violation (one in_progress session per user constraint)
 * by re-reading and returning the existing session.
 * 
 * This is the core logic extracted from startSession to enable testing.
 */
export async function startSessionCore(
  input: StartSessionCoreInput,
): Promise<StartSessionCoreResult> {
  const { supabase, userId, localDate } = input;

  // Check for existing in_progress session for this user + date
  const { data: existingSessions } = await supabase
    .from("sessions")
    .select("id, status, local_date, actual_type")
    .eq("user_id", userId)
    .eq("local_date", localDate)
    .eq("status", "in_progress");

  // If an in_progress session exists for this user + date, return it (idempotent)
  if (existingSessions && existingSessions.length > 0) {
    const existing = existingSessions[0];
    return {
      ok: true,
      sessionId: existing.id,
      existed: true,
    };
  }

  // No existing in_progress session, create a new one
  const { data: session, error } = await supabase
    .from("sessions")
    .insert({
      user_id: userId,
      program_id: input.programId,
      program_day_id: input.programDayId,
      local_date: localDate,
      week_in_block: input.weekInBlock,
      is_deload: input.isDeload,
      planned_type: input.dayType,
      actual_type: input.dayType,
      status: "in_progress",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    // 23505: unique_violation - the partial unique index rejected a duplicate in_progress session
    // Re-read and return the existing in_progress session for this user
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("sessions")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "in_progress")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        return {
          ok: true,
          sessionId: existing.id,
          existed: true,
        };
      }
    }

    // Not a 23505, or re-read failed
    return {
      ok: false,
      error: error.message ?? "Could not start the session",
    };
  }

  if (!session) {
    return {
      ok: false,
      error: "Could not start the session",
    };
  }

  return {
    ok: true,
    sessionId: session.id,
    existed: false,
  };
}
