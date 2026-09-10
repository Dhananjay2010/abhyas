"use server";

import { revalidatePath } from "next/cache";
import { revalidateTrainingData } from "@/lib/revalidate";
import { getAuthedClient } from "@/lib/supabase/auth";
import { localDateString } from "@/lib/dates";

export type Result = { ok: true } | { ok: false; error: string };

/**
 * Record a yoga video as done.
 *
 * Completion is self-reported: there is no way to know whether an embedded
 * video was actually watched, and pretending otherwise would be dishonest
 * (SPEC section 9.3). Alongside the playlist progress this writes a completed
 * session for the day, so yoga counts towards streaks and shows in history
 * exactly like a strength session.
 */
export async function markYogaVideoDone(videoId: string): Promise<Result> {
  const { supabase, user } = await getAuthedClient();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: video } = await supabase
    .from("yoga_videos")
    .select("id, playlist_id, duration_minutes")
    .eq("id", videoId)
    .maybeSingle();
  if (!video) return { ok: false, error: "That video is not in the library." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();
  const today = localDateString(profile?.timezone || "Asia/Kolkata");

  // Append without duplicating, so re-marking the same video is harmless.
  const { data: existing } = await supabase
    .from("user_yoga_progress")
    .select("completed_video_ids")
    .eq("playlist_id", video.playlist_id)
    .maybeSingle();

  const done = new Set(existing?.completed_video_ids ?? []);
  done.add(video.id);

  const { error: progressError } = await supabase.from("user_yoga_progress").upsert(
    {
      user_id: user.id,
      playlist_id: video.playlist_id,
      completed_video_ids: [...done],
      last_completed_at: new Date().toISOString(),
    },
    { onConflict: "user_id,playlist_id" },
  );
  if (progressError) return { ok: false, error: progressError.message };

  // Only reuse a session that is actually a yoga slot. Reusing whatever row
  // happened to exist meant a yoga session inherited a strength day's
  // program_day, and History listed it as "Legs".
  const { data: candidates } = await supabase
    .from("sessions")
    .select("id, status, planned_type")
    .eq("local_date", today);
  const session = (candidates ?? []).find(
    (c) => c.status !== "completed" && c.planned_type === "yoga",
  );

  const payload = {
    status: "completed" as const,
    actual_type: "yoga" as const,
    completed_at: new Date().toISOString(),
    duration_seconds: (video.duration_minutes ?? 0) * 60 || null,
    yoga_video_id: video.id,
  };

  const { error: sessionError } = session
    ? await supabase.from("sessions").update(payload).eq("id", session.id)
    : await supabase.from("sessions").insert({
        user_id: user.id,
        local_date: today,
        planned_type: "yoga",
        ...payload,
      });
  if (sessionError) return { ok: false, error: sessionError.message };

  revalidatePath("/yoga");
  revalidateTrainingData();
  return { ok: true };
}
