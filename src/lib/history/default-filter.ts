import type { Database } from "@/lib/database.types";

export type SessionType = "lifts" | "yoga" | "breathing";
type TrackType = Database["public"]["Enums"]["track_type"] | null;

/**
 * Determine the default History filter tab based on the member's primary track.
 * 
 * Used to open History on the right tab for yoga/breathing members (QA M-4).
 */
export function getDefaultFilter(primaryTrack: TrackType): SessionType {
  if (primaryTrack === "yoga") return "yoga";
  if (primaryTrack === "meditation") return "breathing";
  return "lifts";
}
