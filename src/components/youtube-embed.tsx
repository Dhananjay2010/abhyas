"use client";

import { useState } from "react";

/**
 * YouTube embed with click-to-load poster.
 *
 * Replaces the eager iframe (which shows a black box for 35-40s on 3G)
 * with a poster: YouTube thumbnail + play button. Mounts the iframe only
 * after a tap, with autoplay=1.
 *
 * Thumbnail URL: https://i.ytimg.com/vi/{videoId}/hqdefault.jpg
 * (Added to next.config images if needed for CSP/next/image)
 */
export function YouTubeEmbed({
  videoId,
  title,
}: {
  videoId: string;
  title: string;
}) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div style={{ position: "relative", paddingTop: "56.25%" }}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&autoplay=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
        />
      </div>
    );
  }

  const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return (
    <button
      onClick={() => setPlaying(true)}
      className="group relative block w-full"
      style={{ paddingTop: "56.25%" }}
      aria-label={`Play ${title}`}
    >
      {/* YouTube thumbnail */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbnailUrl}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Play button overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/40">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-fg transition-transform group-hover:scale-110">
          {/* Play icon (SVG triangle) */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-8 w-8"
            aria-hidden="true"
          >
            <path
              d="M8 5v14l11-7z"
              fill="currentColor"
            />
          </svg>
        </div>
      </div>
    </button>
  );
}
