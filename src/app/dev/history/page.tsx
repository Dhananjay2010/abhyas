import { notFound } from "next/navigation";
import { SessionRow, type SessionSummary } from "@/components/session-row";
import { BottomNav } from "@/components/bottom-nav";

/** Development-only harness for the history list. */
export const dynamic = "force-dynamic";

const SESSIONS: SessionSummary[] = [
  { id: "1", localDate: "2026-09-09", label: "Upper", status: "in_progress", isDeload: false, durationSeconds: null, setCount: 3, volumeKg: 1440 },
  { id: "2", localDate: "2026-09-07", label: "Lower", status: "completed", isDeload: false, durationSeconds: 3480, setCount: 18, volumeKg: 8420 },
  { id: "3", localDate: "2026-09-05", label: "Upper", status: "completed", isDeload: true, durationSeconds: 2700, setCount: 12, volumeKg: 4100 },
  { id: "4", localDate: "2026-09-04", label: "Yoga", status: "completed", isDeload: false, durationSeconds: 1800, setCount: 0, volumeKg: 0 },
  { id: "5", localDate: "2026-09-02", label: "Lower", status: "skipped", isDeload: false, durationSeconds: null, setCount: 0, volumeKg: 0 },
];

export default async function DevHistoryPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <h1 className="text-3xl font-bold tracking-tight">History harness</h1>
      <p className="mt-2 mb-8 text-sm text-muted">Fixture rows, covering each status.</p>
      <ul className="space-y-2">
        {SESSIONS.map((s) => (
          <li key={s.id}>
            <SessionRow s={s} today="2026-09-09" />
          </li>
        ))}
      </ul>
      <BottomNav active="/history" />
    </main>
  );
}
