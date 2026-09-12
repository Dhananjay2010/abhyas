import { notFound } from "next/navigation";
import { BreathingDetail, type BreathingLog } from "@/app/history/[id]/breathing-detail";

/**
 * Development-only harness for a breathing practice's History page.
 *
 *   ?v=full     finished, checked in before and after (default)
 *   ?v=early    ended early, checked in afterwards only
 *   ?v=legacy   recorded before breathing_logs existed
 */
export const dynamic = "force-dynamic";

const FULL: BreathingLog = {
  pattern_name: "Box Breathing",
  cycles_completed: 19,
  planned_cycles: 19,
  breaths: 19,
  seconds: 304,
  ended_early: false,
  mood_before: 2,
  mood_after: 5,
  guidance: "tones",
};

export default async function DevBreathingDetailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const v = (await searchParams).v;

  if (v === "legacy") {
    return <BreathingDetail name="Breathing" slug={null} localDate="2026-09-03" seconds={600} log={null} />;
  }
  if (v === "early") {
    const log = { ...FULL, cycles_completed: 7, breaths: 7, seconds: 118, ended_early: true, mood_before: null, mood_after: 4, guidance: "off" };
    return <BreathingDetail name="Box Breathing" slug="box-breathing" localDate="2026-09-10" seconds={118} log={log} />;
  }
  return <BreathingDetail name="Box Breathing" slug="box-breathing" localDate="2026-09-11" seconds={304} log={FULL} />;
}
