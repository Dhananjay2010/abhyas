import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthedClient } from "@/lib/supabase/auth";
import { getCachedYogaData } from "@/lib/supabase/cached-queries";
import { YogaPlayer, type YogaPlaylist } from "./yoga-player";
import { PracticeSwitch } from "@/components/practice-switch";

export const dynamic = "force-dynamic";

export default async function YogaPage() {
  const { supabase, user } = await getAuthedClient();
  if (!user) redirect("/");

  const [yogaData, progressRes] = await Promise.all([
    getCachedYogaData(),
    supabase.from("user_yoga_progress").select("playlist_id, completed_video_ids"),
  ]);

  const { playlists: playlistsData, videos: videosData } = yogaData;

  const doneIds = new Set(
    (progressRes.data ?? []).flatMap((p) => p.completed_video_ids ?? []),
  );

  const playlists: YogaPlaylist[] = playlistsData
    .filter((p) => p.level && p.youtube_playlist_id)
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      description: p.description,
      level: p.level!,
      isSeries: p.is_series,
      youtubePlaylistId: p.youtube_playlist_id,
      videos: videosData
        .filter((v) => v.playlist_id === p.id && v.youtube_video_id)
        .map((v) => ({
          id: v.id,
          youtubeId: v.youtube_video_id!,
          title: v.title,
          minutes: v.duration_minutes,
          dayIndex: v.day_index,
          done: doneIds.has(v.id),
        }))
        .sort((a, b) => {
          // Sort: intro videos (dayIndex <= 0 or null) first, then by dayIndex ascending
          const aDay = a.dayIndex ?? -1;
          const bDay = b.dayIndex ?? -1;
          return aDay - bDay;
        }),
    }));

  const channelUrl =
    playlistsData[0]?.channel_url ?? "https://www.youtube.com/@yogawithadriene";

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <PracticeSwitch />
      
      <div className="mt-6">
        <h1 className="text-3xl font-bold tracking-tight">Yoga</h1>
        <p className="mt-2 mb-8 text-sm text-muted">
          Work through a series day by day, or pick a single practice.
        </p>

        <Suspense fallback={<p className="text-muted">Loading...</p>}>
          <YogaPlayer playlists={playlists} channelUrl={channelUrl} />
        </Suspense>
      </div>
    </main>
  );
}
