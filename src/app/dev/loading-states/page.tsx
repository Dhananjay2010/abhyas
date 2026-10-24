import { notFound } from "next/navigation";
import TodayLoading from "@/app/today/loading";
import HistoryLoading from "@/app/history/(list)/loading";
import ProgressLoading from "@/app/progress/loading";
import SettingsLoading from "@/app/settings/loading";
import SessionLoading from "@/app/session/[id]/loading";
import BreathePatternLoading from "@/app/breathe/[slug]/loading";

export default function LoadingStatesPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const state = (searchParams as { state?: string }).state;
  if (!state) notFound();

  switch (state) {
    case "today":
      return <TodayLoading />;
    case "history":
      return <HistoryLoading />;
    case "progress":
      return <ProgressLoading />;
    case "settings":
      return <SettingsLoading />;
    case "session":
      return <SessionLoading />;
    case "breathe-pattern":
      return <BreathePatternLoading />;
    case "breathe-journey":
      return <BreathePatternLoading />;
    case "breathe-routine":
      return <BreathePatternLoading />;
    default:
      notFound();
  }
}
