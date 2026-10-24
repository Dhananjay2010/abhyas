/**
 * Cached queries for static catalogue data.
 *
 * These use React's `cache()` to deduplicate fetches within a single request
 * and Next.js's data cache (when enabled) to share results across requests.
 * Catalogue tables (breathing patterns, routines, journeys, equipment, yoga
 * playlists/videos) change only when an admin seeds new content, so they are
 * safe to cache.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  PATTERN_COLUMNS,
  patternFromRow,
  type Pattern,
} from "@/lib/breathing/pattern";
import {
  ROUTINE_COLUMNS,
  routineFromRow,
  type Routine,
} from "@/lib/breathing/routine";
import {
  JOURNEY_COLUMNS,
  journeyFromRow,
  type Journey,
} from "@/lib/breathing/journey";

/**
 * Built-in breathing patterns. Static catalogue data, safe to cache.
 */
export const getCachedBreathingPatterns = cache(async (): Promise<Pattern[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("breathing_patterns")
    .select(PATTERN_COLUMNS)
    .order("sort_order");

  return (data ?? [])
    .map((row) => patternFromRow(row))
    .filter((p): p is Pattern => p !== null);
});

/**
 * Breathing routines. Static catalogue data, safe to cache.
 */
export const getCachedBreathingRoutines = cache(async (): Promise<Routine[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("breathing_routines")
    .select(ROUTINE_COLUMNS)
    .order("sort_order");

  return (data ?? [])
    .map((row) => routineFromRow(row))
    .filter((r): r is Routine => r !== null);
});

/**
 * Breathing journeys. Static catalogue data, safe to cache.
 */
export const getCachedBreathingJourneys = cache(async (): Promise<Journey[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("breathing_journeys")
    .select(JOURNEY_COLUMNS)
    .order("sort_order");

  return (data ?? [])
    .map((row) => journeyFromRow(row))
    .filter((j): j is Journey => j !== null);
});

/**
 * Equipment list. Static catalogue data, safe to cache.
 */
export const getCachedEquipment = cache(
  async (): Promise<Array<{ id: string; name: string; category: string }>> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("equipment")
      .select("id, name, category")
      .order("sort_order");

    return data ?? [];
  },
);

type YogaPlaylist = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  level: string | null;
  is_series: boolean;
  youtube_playlist_id: string | null;
  channel_url: string | null;
  sort_order: number;
};

type YogaVideo = {
  id: string;
  playlist_id: string;
  youtube_video_id: string | null;
  title: string;
  duration_minutes: number | null;
  day_index: number | null;
  sort_order: number;
};

/**
 * Yoga playlists and videos. Static catalogue data, safe to cache.
 * Returns both in one query batch to avoid an extra round trip.
 */
export const getCachedYogaData = cache(
  async (): Promise<{
    playlists: YogaPlaylist[];
    videos: YogaVideo[];
  }> => {
    const supabase = await createClient();

    const [playlistsRes, videosRes] = await Promise.all([
      supabase
        .from("yoga_playlists")
        .select(
          "id, slug, title, description, level, is_series, youtube_playlist_id, channel_url, sort_order",
        )
        .order("sort_order"),
      supabase
        .from("yoga_videos")
        .select(
          "id, playlist_id, youtube_video_id, title, duration_minutes, day_index, sort_order",
        )
        .order("sort_order"),
    ]);

    return {
      playlists: playlistsRes.data ?? [],
      videos: videosRes.data ?? [],
    };
  },
);
