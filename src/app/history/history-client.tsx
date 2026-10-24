"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { SessionListItem, SessionType } from "./types";
import { formatInTimezone } from "@/lib/timezone";

interface HistoryClientProps {
  items: SessionListItem[];
  filter: SessionType;
  page: number;
  totalCount: number;
  today: string;
  timezone: string;
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

function formatTime(isoTimestamp: string, timezone: string): string {
  return formatInTimezone(new Date(isoTimestamp), timezone, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function HistoryClient({
  items,
  filter,
  page,
  totalCount,
  today,
  timezone,
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
              const timeLabel =
                item.completedAt && item.localDate === today
                  ? formatTime(item.completedAt, timezone)
                  : item.localDate === today
                    ? "Today"
                    : longDate(item.localDate);

              const minutes = item.durationSeconds ? Math.round(item.durationSeconds / 60) : null;

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
                if (minutes !== null) details.push(`${minutes}m`);
                if (item.breathing.breaths) {
                  const word = item.breathing.pumps ? "pumps" : "breaths";
                  details.push(`${item.breathing.breaths} ${word}`);
                }
              } else {
                details.push("Completed");
                if (item.isDeload) details.push("deload");
                if (minutes !== null) details.push(`${minutes}m`);
                if (item.setCount > 0) details.push(`${item.setCount} sets`);
                if (item.topSetWeight) details.push(`${Math.round(item.topSetWeight)}kg top`);
                if (item.volumeKg > 0) details.push(`${Math.round(item.volumeKg)}kg total`);
              }

              return (
                <li key={item.id}>
                  <Link
                    href={`/history/${item.id}`}
                    className="flex min-h-[44px] items-center rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-muted/50"
                  >
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
                  </Link>
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
