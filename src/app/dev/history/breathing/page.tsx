import { notFound } from "next/navigation";
import { BreathingDetail, type BreathingLog } from "@/app/history/[id]/breathing-detail";

/**
 * Development-only harness for a breathing practice's History page.
 *
 *   ?v=full     finished, checked in before and after (default)
 *   ?v=early    ended early, checked in afterwards only
 *   ?v=legacy   recorded before breathing_logs existed
 *   ?v=routine  a routine: three steps in one session
 *   ?v=cut      a routine stopped at its second step
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
  routine_name: null,
  routine_step: null,
};

const step = (
  n: number,
  pattern_name: string,
  breaths: number,
  seconds: number,
  extra: Partial<BreathingLog> = {},
): BreathingLog => ({
  ...FULL,
  pattern_name,
  cycles_completed: breaths,
  planned_cycles: breaths,
  breaths,
  seconds,
  // Both check-ins live on the first step, which is where the detail reads them.
  mood_before: n === 1 ? 2 : null,
  mood_after: n === 1 ? 5 : null,
  guidance: "ocean",
  routine_name: "Downshift",
  routine_step: n,
  ...extra,
});

const ROUTINE: BreathingLog[] = [
  step(1, "Physiological Sigh", 5, 45),
  step(2, "Extended Exhale", 12, 120),
  step(3, "Coherent Breathing", 11, 121),
];

export default async function DevBreathingDetailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const v = (await searchParams).v;

  if (v === "legacy") {
    return <BreathingDetail name="Breathing" slug={null} localDate="2026-09-03" seconds={600} logs={[]} />;
  }
  if (v === "early") {
    const log = { ...FULL, cycles_completed: 7, breaths: 7, seconds: 118, ended_early: true, mood_before: null, mood_after: 4, guidance: "off" };
    return <BreathingDetail name="Box Breathing" slug="box-breathing" localDate="2026-09-10" seconds={118} logs={[log]} />;
  }
  if (v === "routine") {
    return (
      <BreathingDetail
        name="Downshift"
        slug={null}
        isRoutine
        localDate="2026-09-12"
        seconds={286}
        logs={ROUTINE}
      />
    );
  }
  if (v === "cut") {
    const cut = [
      ROUTINE[0],
      { ...ROUTINE[1], cycles_completed: 4, breaths: 4, seconds: 40, ended_early: true },
    ];
    return (
      <BreathingDetail
        name="Downshift"
        slug={null}
        isRoutine
        localDate="2026-09-12"
        seconds={85}
        logs={cut}
      />
    );
  }
  return <BreathingDetail name="Box Breathing" slug="box-breathing" localDate="2026-09-11" seconds={304} logs={[FULL]} />;
}
