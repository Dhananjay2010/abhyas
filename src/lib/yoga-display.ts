/**
 * Strips trailing series suffixes from yoga video titles for display purposes.
 * The stored data is never changed - this is display-only formatting.
 * 
 * Examples:
 * - "Home - Day 0 - Welcome Home | 30 Days of Yoga" → "Home - Day 0 - Welcome Home"
 * - "Basic Yoga Practice | 30 Days of Yoga" → "Basic Yoga Practice"
 * - "Morning Flow" → "Morning Flow"
 */
export function stripSeriesSuffix(title: string): string {
  // Match " | <number> Days of Yoga" or similar patterns at the end
  return title.replace(/\s*\|\s*\d+\s+Days?\s+of\s+Yoga\s*$/i, "");
}

/**
 * Interface for videos that can be grouped.
 * Matches the YogaVideo type from yoga-player.tsx.
 */
export type YogaVideoForGrouping = {
  id: string;
  title: string;
  dayIndex: number | null;
  done: boolean;
  youtubeId?: string;
  minutes?: number | null;
};

export type YogaWeekGroup = {
  label: string;
  videos: YogaVideoForGrouping[];
};

/**
 * Groups yoga videos by week based on their day_index.
 * Day 0-6 = Week 1, Day 7-13 = Week 2, etc.
 * Videos without a day_index go into an "Other videos" group.
 */
export function groupVideosByWeek(videos: YogaVideoForGrouping[]): YogaWeekGroup[] {
  const weekMap = new Map<number, YogaVideoForGrouping[]>();
  const otherVideos: YogaVideoForGrouping[] = [];

  for (const video of videos) {
    if (video.dayIndex === null) {
      otherVideos.push(video);
    } else {
      const weekNumber = Math.floor(video.dayIndex / 7) + 1;
      const existing = weekMap.get(weekNumber) ?? [];
      existing.push(video);
      weekMap.set(weekNumber, existing);
    }
  }

  const groups: YogaWeekGroup[] = [];
  
  // Sort weeks numerically
  const weekNumbers = Array.from(weekMap.keys()).sort((a, b) => a - b);
  
  for (const weekNum of weekNumbers) {
    const videos = weekMap.get(weekNum) ?? [];
    // Sort videos within week by day_index
    videos.sort((a, b) => (a.dayIndex ?? 0) - (b.dayIndex ?? 0));
    
    // Calculate day range for the week label
    const minDay = Math.min(...videos.map(v => v.dayIndex ?? 0));
    const maxDay = Math.max(...videos.map(v => v.dayIndex ?? 0));
    const label = `Week ${weekNum} (Day ${minDay}–${maxDay})`;
    
    groups.push({ label, videos });
  }

  // Add other videos at the end if any
  if (otherVideos.length > 0) {
    groups.push({ label: "Other videos", videos: otherVideos });
  }

  return groups;
}
