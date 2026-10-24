"use client";

import { useMemo, useState, useTransition } from "react";
import { markYogaVideoDone } from "./actions";
import { branding } from "@/lib/branding";

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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Open the series with progress already in it, otherwise the first playlist.
  const initial =
    playlists.find((p) => p.videos.some((v) => v.done)) ?? playlists[0] ?? null;
  const [openId, setOpenId] = useState<string | null>(initial?.id ?? null);
  const open = playlists.find((p) => p.id === openId) ?? null;

  const nextUp = useMemo(
    () => open?.videos.find((v) => !v.done) ?? open?.videos[0] ?? null,
    [open],
  );
  const [playingId, setPlayingId] = useState<string | null>(null);
  const playing = open?.videos.find((v) => v.id === playingId) ?? nextUp;

  if (playlists.length === 0) {
    return <p className="text-muted">No yoga series are available yet.</p>;
  }

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
              disabled={pending || playing.done}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const r = await actions.markYogaVideoDone(playing.id);
                  if (!r.ok) return setError(r.error);
                  setPlayingId(null);
                  // markYogaVideoDone revalidates "/yoga"; the re-rendered tree
                  // comes back with the action. A refresh here fetched it twice.
                })
              }
              className="w-full rounded-xl bg-accent px-6 py-4 text-base font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {playing.done ? "Already marked done" : pending ? "Saving…" : "I did this"}
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
              {open.videos.filter((v) => v.done).length} of {open.videos.length} done
            </span>
          </div>
          <ul className="space-y-1.5">
            {open.videos.map((v) => (
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
                        v.done ? "bg-success" : "bg-border"
                      }`}
                    />
                    <span className={`truncate ${v.done ? "text-muted" : ""}`}>
                      {v.title}
                    </span>
                  </span>
                  {v.minutes && (
                    <span className="shrink-0 text-xs text-muted">{v.minutes}m</span>
                  )}
                </button>
              </li>
            ))}
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
        , played from YouTube. {branding.name} does not host or modify it.
      </p>
    </div>
  );
}
