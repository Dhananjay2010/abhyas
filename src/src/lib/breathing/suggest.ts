import type { Pattern } from "./pattern";

export type Suggestion = { pattern: Pattern; reason: string };

/**
 * One practice for right now, and why.
 *
 * Deliberately a handful of plain rules rather than anything clever: the
 * reason is shown on the card, so it has to be a sentence a person would
 * agree with. The order within each case is a fallback chain, in case a
 * practice is missing.
 *
 * `hour` is the hour of day where the user is, not on the server.
 */
export function suggestPractice(opts: {
  patterns: Pattern[];
  hour: number;
  trainedToday: boolean;
  /** Usually the practice already offered by the "Again" card; never suggested twice. */
  excludeId?: string | null;
}): Suggestion | null {
  const { patterns, hour, trainedToday, excludeId } = opts;

  const chain: Array<[slug: string, reason: string]> = trainedToday
    ? [
        ["physiological-sigh", "You trained today. This is the fastest way back down."],
        ["extended-exhale", "You trained today. A longer exhale settles you afterwards."],
      ]
    : hour >= 21 || hour < 5
      ? [
          ["four-seven-eight", "It is late. The long exhale is the one for sleep."],
          ["extended-exhale", "It is late. Out for longer than in, and nothing held."],
        ]
      : hour < 11
        ? [
            ["box-breathing", "Morning. Four equal sides, for a steady start."],
            ["coherent-breathing", "Morning. Smooth and even, to begin the day."],
          ]
        : [
            ["coherent-breathing", "Five and a half breaths a minute — the easiest to do daily."],
            ["extended-exhale", "Out for longer than in. Gentle, any time of day."],
          ];

  for (const [slug, reason] of chain) {
    const pattern = patterns.find((p) => p.kind === "builtin" && p.slug === slug);
    if (pattern && pattern.id !== excludeId) return { pattern, reason };
  }
  return null;
}
