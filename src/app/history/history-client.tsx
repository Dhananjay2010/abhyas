"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { SessionListItem, SessionType } from "./types";
import { formatVolume, formatTopSet, type UnitsPreference } from "@/lib/units";
import { closeOutSession } from "./actions";
import { getSessionLabel, type SessionStatus, type ActualType } from "@/lib/history/session-label";
import { formatSessionDateTime } from "@/lib/history/format-session-datetime";
import { formatDurationMinutes } from "@/lib/history/compute-duration";

// Helper for proper pluralization
function pluralize(count: number, singular: string, plural?: string): string {
  if (count === 1) return `${count} ${singular}`;
  return `${count} ${plural || singular + "s"}`;
}

interface HistoryClientProps {
  items: SessionListItem[];
  filter: SessionType;
  page: number;
  totalCount: number;
  today: string;
  timezone: string;
  units: UnitsPreference;
  hasErrors: boolean;
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

function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function HistoryClient({
  items,
  filter,
  page,
  totalCount,
  today,
  timezone,
  units,
  hasErrors,
}: HistoryClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const limit = 20;
  const totalPages = Math.ceil(totalCount / limit);
  const [closingOut, setClosingOut] = useState<string | null>(null);

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

  const handleCloseOut = async (sessionId: string) => {
    setClosingOut(sessionId);
    const result = await closeOutSession(sessionId);
    if (result.error) {
      alert(`Failed to close out session: ${result.error}`);
    }
    setClosingOut(null);
    router.refresh();
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

      {/* Error banner (QA Bot 3 M3) */}
      {hasErrors && (
        <p className="mt-4 rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10 px-4 py-2 text-sm text-[var(--color-danger)]">
          Couldn&apos;t load some stats
        </p>
      )}

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
              // M2: Detect past-day in_progress sessions
              const isPastInProgress = item.status === "in_progress" && item.localDate !== today;

              // Format time for all rows through formatSessionDateTime
              let timeLabel = "";
              if (isPastInProgress) {
                timeLabel = `Unfinished from ${longDate(item.localDate)}`;
              } else {
                // Use formatSessionDateTime for all rows (including today) to get proper time display
                timeLabel = formatSessionDateTime(item.startedAt, item.localDate, timezone, today);
              }

              // Item 9: Duration - never show "0 min" for NULL duration
              const durationLabel = formatDurationMinutes(item.durationSeconds);

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
              } else {
                // Get session status label using extracted function
                const statusLabel = getSessionLabel({
                  status: item.status as SessionStatus,
                  actualType: item.actualType as ActualType,
                  setCount: item.setCount,
                  localDate: item.localDate,
                  today,
                  endedEarly: item.endedEarly,
                  plannedSets: item.plannedSets,
                });
                
                // For past in_progress, the timeLabel already shows "Unfinished from <date>"
                // so we just push the statusLabel which will be that message
                if (isPastInProgress) {
                  // Status label contains "Unfinished from <date>", skip adding it to details
                  // since it's already in timeLabel
                } else {
                  details.push(statusLabel);
                }
                
                if (item.isDeload) details.push("deload");
                if (durationLabel) details.push(durationLabel);
                
                // Show set count unless it's zero-set or already shown in "Ended early"
                const isZeroSetStrength = (item.actualType === "weights" || item.actualType === "bodyweight" || item.actualType === null) && item.setCount === 0;
                if (!item.endedEarly && !isZeroSetStrength && item.setCount > 0) {
                  details.push(pluralize(item.setCount, "set"));
                }
                if (item.topSetWeight) {
                  details.push(formatTopSet(item.topSetWeight, units));
                }
                if (item.volumeKg > 0) {
                  // Use non-breaking space to keep number+unit together at narrow widths
                  details.push(`${formatVolume(item.volumeKg, units)}\u00A0total`);
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
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-xs text-muted">{details.join(" · ")}</p>
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
                  {isPastInProgress ? (
                    <div className="flex min-h-[44px] items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
                      {content}
                      <button
                        onClick={() => handleCloseOut(item.id)}
                        disabled={closingOut === item.id}
                        className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {closingOut === item.id ? "Closing..." : "Close out"}
                      </button>
                    </div>
                  ) : isInteractive ? (
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
