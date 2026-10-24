"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { markYogaVideoDone } from "./actions";

export type YogaVideo = {
  id: string;
  youtubeId: string;
  title: string;
  minutes: number | null;
  dayIndex: number | null;
  done: boolean;
};

export type YogaPlaylist = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  level: string;
  isSeries: boolean;
  youtubePlaylistId: string | null;
  videos: YogaVideo[];
};

type Actions = { markYogaVideoDone: typeof markYogaVideoDone };
const REAL: Actions = { markYogaVideoDone };

export function YogaPlayer({
  playlists,
  channelUrl,
  actions = REAL,
}: {
  playlists: YogaPlaylist[];
  channelUrl: string;
  actions?: Actions;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimisticDone, setOptimisticDone] = useState<Set<string>>(new Set());

  // Open the series with progress already in it, otherwise the first playlist.
  const initial =
    playlists.find((p) => p.videos.some((v) => v.done)) ?? playlists[0] ?? null;
  
  // Restore from URL or use initial
  const urlPlaylistId = searchParams.get("playlist");
  const urlVideoId = searchParams.get("video");
  const initialPlaylistId = urlPlaylistId && playlists.some(p => p.id === urlPlaylistId) 
    ? urlPlaylistId 
    : initial?.id ?? null;
  
  const [openId, setOpenId] = useState<string | null>(initialPlaylistId);
  const open = playlists.find((p) => p.id === openId) ?? null;

  const nextUp = useMemo(
    () => {
      const videos = open?.videos.map(v => ({
        ...v,
        done: v.done || optimisticDone.has(v.id)
      })) ?? [];
      return videos.find((v) => !v.done) ?? videos[0] ?? null;
    },
    [open, optimisticDone],
  );
  
  // Restore playing video from URL
  const initialPlayingId = urlVideoId && open?.videos.some(v => v.id === urlVideoId)
    ? urlVideoId
    : null;
  
  const [playingId, setPlayingId] = useState<string | null>(initialPlayingId);
  const playing = open?.videos.find((v) => v.id === playingId) ?? nextUp;

  // Update URL when selection changes
  useEffect(() => {
    if (!open) return;
    const params = new URLSearchParams();
    params.set("playlist", open.id);
    if (playing) {
      params.set("video", playing.id);
    }
    router.replace(`/yoga?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.id, playing?.id, router]);

  if (playlists.length === 0) {
    return <p className="text-muted">No yoga series are available yet.</p>;
  }

  const isOptimisticallyDone = playing && optimisticDone.has(playing.id);
  const isActuallyDone = playing?.done ?? false;
  const isDone = isActuallyDone || isOptimisticallyDone;

  return (
    <div>
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {open && playing && (
        <section className="mb-8">
          <div className="overflow-hidden rounded-xl border border-border bg-black">
            {/* 16:9 without a plugin */}
            <div style={{ position: "relative", paddingTop: "56.25%" }}>
              <iframe
                key={playing.youtubeId}
                src={`https://www.youtube-nocookie.com/embed/${playing.youtubeId}?rel=0&modestbranding=1`}
                title={playing.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
              />
            </div>
          </div>

          <h2 className="mt-3 font-semibold">{playing.title}</h2>
          <p className="mt-1 text-xs text-muted">
            {playing.minutes ? `${playing.minutes} min · ` : ""}
            Yoga with Adriene
          </p>

          {/*
            A video can be removed or have embedding revoked at any time, and
            an iframe gives no reliable cross-origin way to detect that. So the
            escape hatch is always present rather than conditional.
          */}
          <a
            href={`https://www.youtube.com/watch?v=${playing.youtubeId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-xs text-muted underline underline-offset-2"
          >
            Player not working? Open on YouTube
          </a>

          <div className="mt-4">
            <button
              disabled={pending || isDone}
              onClick={() => {
                if (!playing) return;
                // Optimistic update
                setOptimisticDone(prev => new Set([...prev, playing.id]));
                setError(null);
                
                startTransition(async () => {
                  const r = await actions.markYogaVideoDone(playing.id);
                  if (!r.ok) {
                    // Rollback on error
                    setOptimisticDone(prev => {
                      const next = new Set(prev);
                      next.delete(playing.id);
                      return next;
                    });
                    setError(r.error);
                  } else {
                    // Success - the revalidation will update the actual done state
                    setPlayingId(null);
                  }
                });
              }}
              className="w-full rounded-xl bg-accent px-6 py-4 text-base font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {isDone ? "Already marked done" : pending ? "Saving…" : "I did this"}
            </button>
            <p className="mt-2 text-center text-xs text-muted">
              We cannot tell whether a video was watched, so this is on your word.
            </p>
          </div>
        </section>
      )}

      {open && (
        <section className="mb-10">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">{open.title}</h2>
            <span className="shrink-0 text-xs text-muted">
              {open.videos.filter((v) => v.done || optimisticDone.has(v.id)).length} of {open.videos.length} done
            </span>
          </div>
          <ul className="space-y-1.5">
            {open.videos.map((v) => {
              const vDone = v.done || optimisticDone.has(v.id);
              return (
                <li key={v.id}>
                  <button
                    onClick={() => setPlayingId(v.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                      v.id === playing?.id
                        ? "border-accent bg-accent/10"
                        : "border-border bg-surface hover:border-muted/50"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          vDone ? "bg-success" : "bg-border"
                        }`}
                      />
                      <span className={`truncate ${vDone ? "text-muted" : ""}`}>
                        {v.title}
                      </span>
                    </span>
                    {v.minutes && (
                      <span className="shrink-0 text-xs text-muted">{v.minutes}m</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold">All series</h2>
        <ul className="space-y-2">
          {playlists.map((p) => {
            const done = p.videos.filter((v) => v.done).length;
            return (
              <li key={p.id}>
                <button
                  onClick={() => {
                    setOpenId(p.id);
                    setPlayingId(null);
                  }}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                    p.id === openId
                      ? "border-accent bg-accent/10"
                      : "border-border bg-surface hover:border-muted/50"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{p.title}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {done > 0 ? `${done}/${p.videos.length}` : `${p.videos.length}`}
                    </span>
                  </div>
                  {p.description && (
                    <p className="mt-1 text-xs text-muted">{p.description}</p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="mt-8 text-center text-xs text-muted">
        All yoga content is by{" "}
        <a
          href={channelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          Yoga with Adriene
        </a>
        , played from YouTube. Abhyas does not host or modify it.
      </p>
    </div>
  );
}
