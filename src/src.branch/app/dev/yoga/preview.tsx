"use client";

import { YogaPlayer } from "@/app/yoga/yoga-player";
import { FIXTURE } from "./fixture";

export function YogaPreview() {
  return (
    <YogaPlayer
      playlists={FIXTURE}
      channelUrl="https://www.youtube.com/@yogawithadriene"
      actions={{ markYogaVideoDone: async () => ({ ok: true }) as const }}
    />
  );
}
