import TodayLoading from "@/app/today/loading";
import HistoryLoading from "@/app/history/loading";
import ProgressLoading from "@/app/progress/loading";
import SettingsLoading from "@/app/settings/loading";
import SessionLoading from "@/app/session/[id]/loading";

/**
 * Harness for the loading skeletons.
 *
 * The real ones only appear for the fraction of a second between a tap and the
 * server's answer, which is far too short to judge them by. Here they sit still
 * so their shape can be compared against the screens they stand in for.
 */
export default function LoadingStatesHarness() {
  const screens = [
    ["Today", <TodayLoading key="t" />],
    ["History", <HistoryLoading key="h" />],
    ["Progress", <ProgressLoading key="p" />],
    ["Settings", <SettingsLoading key="s" />],
    ["Session", <SessionLoading key="x" />],
  ] as const;

  return (
    <div className="pb-28">
      {screens.map(([name, node]) => (
        <section key={name} className="border-b border-border">
          <p className="bg-surface-2 px-6 py-2 text-xs font-semibold tracking-wider text-muted uppercase">
            {name}
          </p>
          {node}
        </section>
      ))}
    </div>
  );
}
