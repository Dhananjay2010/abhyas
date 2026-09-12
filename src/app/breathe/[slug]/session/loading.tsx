import { ORB_BG, SESSION_BG } from "@/lib/breathing/theme";

/** Already the practice's room, so the tap on Start lands somewhere calm straight away. */
export default function Loading() {
  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center"
      style={{ background: SESSION_BG }}
      aria-busy="true"
      aria-live="polite"
    >
      <div aria-hidden="true" className="breath-idle h-24 w-24 rounded-full" style={{ background: ORB_BG }} />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
