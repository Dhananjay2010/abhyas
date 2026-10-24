import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { YogaPlayer, type YogaPlaylist } from "./yoga-player";
import { PracticeSwitch } from "@/components/practice-switch";

export const dynamic = "force-dynamic";

export default async function YogaPage() {
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  const [playlistsRes, videosRes, progressRes] = await Promise.all([
    supabase
      .from("yoga_playlists")
      .select("id, slug, title, description, level, is_series, youtube_playlist_id, channel_url")
      .order("sort_order"),
    supabase
      .from("yoga_videos")
      .select("id, playlist_id, youtube_video_id, title, duration_minutes, day_index, sort_order")
      .order("sort_order"),
    supabase.from("user_yoga_progress").select("playlist_id, completed_video_ids"),
  ]);

  const doneIds = new Set(
    (progressRes.data ?? []).flatMap((p) => p.completed_video_ids ?? []),
  );

  const playlists: YogaPlaylist[] = (playlistsRes.data ?? []).map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    level: p.level,
    isSeries: p.is_series,
    youtubePlaylistId: p.youtube_playlist_id,
    videos: (videosRes.data ?? [])
      .filter((v) => v.playlist_id === p.id)
      .map((v) => ({
        id: v.id,
        youtubeId: v.youtube_video_id,
        title: v.title,
        minutes: v.duration_minutes,
        dayIndex: v.day_index,
        done: doneIds.has(v.id),
      })),
  }));

  const channelUrl =
    playlistsRes.data?.[0]?.channel_url ?? "https://www.youtube.com/@yogawithadriene";

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <PracticeSwitch />
      
      <div className="mt-6">
        <h1 className="text-3xl font-bold tracking-tight">Yoga</h1>
        <p className="mt-2 mb-8 text-sm text-muted">
          Work through a series day by day, or pick a single practice.
        </p>

        <YogaPlayer playlists={playlists} channelUrl={channelUrl} />
      </div>
    </main>
  );
}
