"use client";

import { BreathingRunner, type Pattern } from "@/app/breathe/breathing-runner";

// Short phases so a full run can be observed in seconds rather than minutes.
const PATTERNS: Pattern[] = [
  {
    id: "p1", slug: "box-breathing", name: "Box Breathing (fast, for testing)",
    description: "Equal counts on all four phases.",
    inhale: 1, holdIn: 1, exhale: 1, holdOut: 1, defaultCycles: 3,
    benefit: "Focus and steady calm.", contraindications: "Ease off the holds if light-headed.",
  },
  {
    id: "p2", slug: "four-seven-eight", name: "4-7-8 (fast, for testing)",
    description: "Inhale, hold, long exhale. No hold at the end.",
    inhale: 1, holdIn: 2, exhale: 2, holdOut: 0, defaultCycles: 2,
    benefit: "Winding down.", contraindications: "Not while pregnant.",
  },
  {
    id: "p3", slug: "nadi-shodhana", name: "Nadi Shodhana (fast, for testing)",
    description: "Alternate nostril.",
    inhale: 1, holdIn: 1, exhale: 1, holdOut: 0, defaultCycles: 4,
    benefit: "Balance.", contraindications: "Skip if your nose is blocked.",
  },
];

export function BreathePreview() {
  return (
    <BreathingRunner
      patterns={PATTERNS}
      defaultMinutes={10}
      actions={{ completeBreathingSession: async () => ({ ok: true }) as const }}
    />
  );
}
