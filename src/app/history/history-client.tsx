"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { SessionListItem, SessionType } from "./types";
import { formatInTimezone } from "@/lib/timezone";
import { sessionCompletion } from "@/lib/session/session-completion";
import { formatVolume, formatTopSet, type UnitsPreference } from "@/lib/units";

// Helper for proper pluralization
function pluralize(count: number, singular: string, plural?: string): string {
  if (count === 1) return `${count} ${singular}`;
  return `${count} ${plural || singular + "s"}`;
}

// Helper for duration display - shows "<1 min" for very short sessions
function formatMinutes(seconds: number | null): string | null {
  if (seconds === null) return null;
  const minutes = Math.round(seconds / 60);
  if (minutes === 0 && seconds > 0) return "<1 min";
  return `${minutes} min`;
}

interface HistoryClientProps {
  items: SessionListItem[];
  filter: SessionType;
  page: number;
  totalCount: number;
  today: string;
  timezone: string;
  units: UnitsPreference;
}

const FILTER_LABELS: Record<SessionType, string> = {
  lifts: "Lifts",
  yoga: "Yoga",
  breathing: "Breathing",
};

const EMPTY_MESSAGES: Record<SessionType, { title: string; message: string }> = {
  lifts: {
    title: "No strength sessions yet",
    message: "Your strength workouts will appear here once you complete them.",
  },
  yoga: {
    title: "No yoga sessions yet",
    message: "Your yoga sessions will appear here once you complete them.",
  },
  breathing: {
    title: "No breathing practices yet",
    message: "Your breathing practices will appear here once you complete them.",
  },
};

function longDate(iso: string, today: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const [todayY] = today.split("-").map(Number);
  const includeYear = y !== todayY;
  
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: includeYear ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function formatTime(isoTimestamp: string, timezone: string): string {
  const formatted = formatInTimezone(new Date(isoTimestamp), timezone, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  // Convert AM/PM to lowercase am/pm
  return formatted.replace(/\sAM$/, " am").replace(/\sPM$/, " pm");
}

export function HistoryClient({
  items,
  filter,
  page,
  totalCount,
  today,
  timezone,
  units,
}: HistoryClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const limit = 20;
  const totalPages = Math.ceil(totalCount / limit);

  const handleFilterChange = (newFilter: SessionType) => {
    const params = new URLSearchParams(searchParams);
    params.set("filter", newFilter);
    params.delete("page");
    router.push(`/history?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", newPage.toString());
    router.push(`/history?${params.toString()}`);
  };

  return (
    <main className="mx-auto w-full max-w-md px-6 py-10 pb-28">
      <h1 className="text-3xl font-bold tracking-tight">History</h1>

      {/* Filter tabs */}
      <div className="mt-6 flex gap-2 border-b border-border">
        {(["lifts", "yoga", "breathing"] as SessionType[]).map((f) => (
          <button
            key={f}
            onClick={() => handleFilterChange(f)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              filter === f
                ? "border-b-2 border-accent text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {/* Session count */}
      <p className="mt-4 text-sm text-muted">
        {totalCount === 0
          ? "Nothing here yet."
          : totalCount === 1
            ? "1 session."
            : `${totalCount} sessions.`}
      </p>

      {/* Session list */}
      {items.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border px-5 py-12 text-center">
          <p className="text-sm font-medium text-muted">{EMPTY_MESSAGES[filter].title}</p>
          <p className="mt-1 text-sm text-muted">{EMPTY_MESSAGES[filter].message}</p>
        </div>
      ) : (
        <>
          <ul className="mt-6 space-y-2">
            {items.map((item) => {
              // Format time label with timezone-aware time for same-day sessions
              let timeLabel = "";
              if (item.localDate === today && item.completedAt) {
                timeLabel = `Today · ${formatTime(item.completedAt, timezone)}`;
              } else if (item.localDate === today) {
                timeLabel = "Today";
              } else if (item.completedAt) {
                // For older sessions, show date + time
                timeLabel = `${longDate(item.localDate, today)} · ${formatTime(item.completedAt, timezone)}`;
              } else {
                timeLabel = longDate(item.localDate, today);
              }

              const durationLabel = formatMinutes(item.durationSeconds);

              // Build label for the session
              let label = "";
              if (item.actualType === "meditation") {
                label = item.breathing?.patternName ?? "Breathing";
              } else if (item.actualType === "yoga") {
                label = "Yoga";
              } else {
                label = item.programDayLabel ?? "Workout";
              }

              // Build details line
              const details: string[] = [];
              
              if (item.breathing) {
                details.push("Breathing");
                if (durationLabel) details.push(durationLabel);
                if (item.breathing.breaths) {
                  details.push(pluralize(item.breathing.breaths, item.breathing.pumps ? "pump" : "breath"));
                }
              } else if (item.actualType === "yoga") {
                // For yoga sessions, trust the status field
                if (item.status === "skipped") {
                  details.push("Skipped");
                } else if (item.status === "in_progress" && item.localDate === today) {
                  details.push("In progress");
                } else {
                  details.push("Completed");
                  if (durationLabel) details.push(durationLabel);
                }
              } else {
                // Strength sessions (weights/bodyweight/null)
                const isStrength = item.actualType === "weights" || item.actualType === "bodyweight" || !item.actualType;
                const isZeroSetStrength = isStrength && item.setCount === 0;
                const isSkipped = item.status === "skipped";
                const isInProgress = item.status === "in_progress" && item.localDate === today;
                
                if (isSkipped || isZeroSetStrength) {
                  details.push("Skipped");
                } else if (isInProgress) {
                  details.push("In progress");
                } else if (item.endedEarly && item.plannedSets) {
                  // Show completion status or "Ended early" if applicable
                  details.push(`Ended early · ${item.setCount} of ${item.plannedSets} ${item.plannedSets === 1 ? "set" : "sets"}`);
                } else {
                  details.push("Completed");
                }
                if (item.isDeload) details.push("deload");
                if (durationLabel) details.push(durationLabel);
                // Only show set count if not already shown in "ended early" label or skipped
                if (!item.endedEarly && !isZeroSetStrength && !isSkipped && item.setCount > 0) {
                  details.push(pluralize(item.setCount, "set"));
                }
                if (item.topSetWeight) {
                  details.push(formatTopSet(item.topSetWeight, units));
                }
                if (item.volumeKg > 0) {
                  // Wrap in span to prevent 'kg total' from breaking across lines
                  details.push(`${formatVolume(item.volumeKg, units)} total`);
                }
              }

              // Yoga rows are non-interactive (yoga detail view is owned by PR #19)
              // Breathing and strength sessions link to their detail pages
              const isYoga = item.actualType === "yoga";
              const isInteractive = !isYoga;

              const content = (
                <div className="flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{label}</span>
                    <span className="shrink-0 text-xs text-muted">{timeLabel}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {details.map((detail, idx) => (
                      <span key={idx} className="whitespace-nowrap text-xs text-muted">
                        {detail}
                        {idx < details.length - 1 && <span className="ml-2">·</span>}
                      </span>
                    ))}
                    {item.hasPR && (
                      <span className="rounded bg-accent/10 px-1.5 py-0.5 text-xs font-medium text-accent">
                        PR
                      </span>
                    )}
                  </div>
                </div>
              );

              return (
                <li key={item.id}>
                  {isInteractive ? (
                    <Link
                      href={`/history/${item.id}`}
                      className="flex min-h-[44px] items-center rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-muted/50"
                    >
                      {content}
                      <svg
                        className="ml-2 h-5 w-5 shrink-0 text-muted"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  ) : (
                    <div className="flex min-h-[44px] items-center rounded-xl border border-border bg-surface px-4 py-3">
                      {content}
                      {/* TODO: Link to yoga detail once PR #19 lands */}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
                className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:border-muted/50 transition-colors"
              >
                Previous
              </button>
              <span className="px-4 text-sm text-muted">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page === totalPages}
                className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:border-muted/50 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
