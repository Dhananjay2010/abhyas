-- One row per video per playlist, so the seed can be re-run safely.
create unique index if not exists yoga_videos_playlist_video_key
  on yoga_videos (playlist_id, youtube_video_id);
