"use client";

import { useId, useState } from "react";
import { formatValueExact } from "@/lib/progress/format-chart-value";
import { formatWeight, formatBodyWeight, type UnitsPreference } from "@/lib/units";
import { formatVolumeLifted } from "@/lib/session/format-volume-lifted";

/**
 * Small inline-SVG charts.
 *
 * Every chart here is single-series, which is deliberate: on a 390px phone a
 * multi-line chart of five lifts is unreadable, so per-lift strength is drawn
 * as small multiples instead. Single series also means one hue and no legend —
 * the title names the series.
 *
 * The data hue is `--color-chart` (#d95926). It was validated against this
 * app's chart surface (#151a1f) rather than chosen by eye: it sits inside the
 * dark-mode lightness band and clears 3:1 contrast against the surface.
 */

export type Point = { 
  label: string; 
  value: number;
  isDeload?: boolean;
};

const PAD = { top: 10, right: 8, bottom: 20, left: 34 };

function SinglePoint({ point, fmt, hint }: { point: Point; fmt: (v: number) => string; hint: string }) {
  return (
    <div data-testid="single-point">
      <p className="text-2xl font-bold tabular-nums">{fmt(point.value)}</p>
      <p className="mt-1 text-xs text-muted">{point.label}</p>
      <p className="mt-2 text-xs text-muted">{hint}</p>
    </div>
  );
}

function niceBounds(values: number[]): [number, number] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [min - 1, max + 1];
  const span = max - min;
  return [min - span * 0.12, max + span * 0.12];
}

/** Toggleable table so the numbers are never available only as pixels. */
function ValueTable({
  points,
  fmt,
  caption,
}: {
  points: Point[];
  fmt: (v: number) => string;
  caption: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-muted underline underline-offset-2"
        aria-expanded={open}
      >
        {open ? "Hide values" : "Show values"}
      </button>
      {open && (
        <table className="mt-2 w-full text-xs">
          <caption className="sr-only">{caption}</caption>
          <tbody>
            {[...points].reverse().map((p, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-1.5 text-muted">{p.label}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {fmt(p.value)}
                  {p.isDeload && (
                    <span className="ml-2 text-muted opacity-70">Deload</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function LineChart({
  points,
  unit = "",
  title,
  height = 140,
  singlePointHint = "Log another session to see a trend",
  weightUnits,
  isBodyWeight = false,
}: {
  points: Point[];
  unit?: string;
  title: string;
  height?: number;
  singlePointHint?: string;
  /**
   * Set when the values are weights in kg: every readout (headline, tooltip,
   * table, axis) then goes through the shared formatWeight in these units,
   * e.g. 120.5 lb / 54.6 kg, and `unit` is ignored.
   */
  weightUnits?: UnitsPreference;
  /**
   * Set to true for body weight charts to use 0.1 precision instead of 0.25 kg grid.
   */
  isBodyWeight?: boolean;
}) {
  const fmt = (v: number) => {
    if (!weightUnits) return formatValueExact(v, unit);
    return isBodyWeight ? formatBodyWeight(v, weightUnits) : formatWeight(v, weightUnits);
  };
  const fmtAxis = (v: number) => {
    if (!weightUnits) return Math.round(v).toLocaleString("en-US");
    return isBodyWeight ? formatBodyWeight(v, weightUnits, false, "0") : formatWeight(v, weightUnits, false, "0");
  };
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const width = 320;

  if (points.length === 0) {
    return <EmptyChart title={title} />;
  }
  if (points.length === 1) {
    return <SinglePoint point={points[0]} fmt={fmt} hint={singlePointHint} />;
  }

  const [lo, hi] = niceBounds(points.map((p) => p.value));
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW;
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * innerH;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  // Default to last non-deload point for headline and aria-label; fall back to last point if all are deloads
  const lastNonDeloadIndex = (() => {
    for (let i = points.length - 1; i >= 0; i--) {
      if (!points[i].isDeload) return i;
    }
    return points.length - 1;
  })();
  const allDeloads = points.every(p => p.isDeload);
  const shown = active === null ? lastNonDeloadIndex : active;
  
  // Count distinct deload sessions (word it as "deload sessions" not "weeks")
  const deloadCount = points.filter(p => p.isDeload).length;
  const lastNonDeload = points[lastNonDeloadIndex];

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full touch-none"
        role="img"
        aria-label={`${title}. ${points.length} entries from ${first.label} to ${last.label}, latest value ${fmt(lastNonDeload.value)} on ${lastNonDeload.label}${allDeloads ? ' (deload)' : ''}${deloadCount > 0 ? `. ${deloadCount} deload ${deloadCount === 1 ? 'session' : 'sessions'} marked` : ''}.`}
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * width;
          const i = Math.round(((px - PAD.left) / innerW) * (points.length - 1));
          setActive(Math.min(points.length - 1, Math.max(0, i)));
        }}
        onPointerLeave={() => setActive(null)}
      >
        {/* Recessive gridlines: three hairlines, no box */}
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={PAD.left}
            x2={width - PAD.right}
            y1={PAD.top + t * innerH}
            y2={PAD.top + t * innerH}
            stroke="var(--color-border)"
            strokeWidth="1"
          />
        ))}
        <text x="2" y={PAD.top + 4} fontSize="9" fill="var(--color-muted)">
          {fmtAxis(hi)}
        </text>
        <text x="2" y={PAD.top + innerH + 4} fontSize="9" fill="var(--color-muted)">
          {fmtAxis(lo)}
        </text>

        <path
          d={path}
          fill="none"
          stroke="var(--color-chart)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Deload markers: hollow circles with muted stroke */}
        {points.map((p, i) => 
          p.isDeload ? (
            <circle
              key={`deload-${i}`}
              cx={x(i)}
              cy={y(p.value)}
              r="4"
              fill="var(--color-surface)"
              stroke="var(--color-muted)"
              strokeWidth="1.5"
              opacity="0.7"
            >
              <title>Deload week</title>
            </circle>
          ) : null
        )}

        {/* Crosshair for the touched point */}
        <line
          x1={x(shown)}
          x2={x(shown)}
          y1={PAD.top}
          y2={PAD.top + innerH}
          stroke="var(--color-muted)"
          strokeWidth="1"
          strokeDasharray="2 3"
          opacity={active === null ? 0 : 0.7}
        />
        {/* 2px surface ring keeps the marker readable over the line */}
        <circle
          cx={x(shown)}
          cy={y(points[shown].value)}
          r="4.5"
          fill="var(--color-chart)"
          stroke="var(--color-surface)"
          strokeWidth="2"
        />

        <text x={PAD.left} y={height - 6} fontSize="9" fill="var(--color-muted)">
          {first.label}
        </text>
        <text
          x={width - PAD.right}
          y={height - 6}
          fontSize="9"
          textAnchor="end"
          fill="var(--color-muted)"
        >
          {last.label}
        </text>
        <desc id={id}>{title}</desc>
      </svg>

      <p className="mt-1 text-sm tabular-nums">
        <span className="font-semibold">{fmt(points[shown].value)}</span>{" "}
        <span className="text-muted">· {points[shown].label}{allDeloads ? ' (deload)' : ''}</span>
      </p>

      <ValueTable points={points} fmt={fmt} caption={title} />
    </div>
  );
}

export function BarChart({
  points,
  unit = "",
  title,
  height = 140,
  singlePointHint = "Log another session to see a trend",
  volumeUnits,
}: {
  points: Point[];
  unit?: string;
  title: string;
  height?: number;
  singlePointHint?: string;
  /**
   * Set when the values are volumes in kg: every readout (single point,
   * headline, table, axis, aria) then goes through the shared
   * formatVolumeLifted in these units, e.g. 5,291 lb / 2,400 kg, and `unit`
   * is ignored.
   */
  volumeUnits?: UnitsPreference;
}) {
  const fmt = (v: number) => (volumeUnits ? formatVolumeLifted(v, volumeUnits) : formatValueExact(v, unit));
  const fmtAxis = (v: number) =>
    volumeUnits ? formatVolumeLifted(v, volumeUnits).replace(/ (kg|lb)$/, "") : Math.round(v).toLocaleString("en-US");
  const [active, setActive] = useState<number | null>(null);
  const width = 320;

  if (points.length === 0) return <EmptyChart title={title} />;
  if (points.length === 1) return <SinglePoint point={points[0]} fmt={fmt} hint={singlePointHint} />;

  const max = Math.max(...points.map((p) => p.value), 1);
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  
  // For single-point data, show a narrow bar instead of filling the whole plot
  const slot = points.length === 1 ? 30 : innerW / points.length;
  const barW = Math.max(3, slot - 2);
  
  // Default to last non-deload point for headline and aria-label; fall back to last point if all are deloads
  const lastNonDeloadIndex = (() => {
    for (let i = points.length - 1; i >= 0; i--) {
      if (!points[i].isDeload) return i;
    }
    return points.length - 1;
  })();
  const allDeloads = points.every(p => p.isDeload);
  const lastNonDeload = points[lastNonDeloadIndex];
  const shown = active === null ? lastNonDeloadIndex : active;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full touch-none"
        role="img"
        aria-label={`${title}. ${points.length} ${points.length === 1 ? "session" : "sessions"}, most recent ${fmt(lastNonDeload.value)}${allDeloads ? ' (deload)' : ''}.`}
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * width;
          const i = Math.floor((px - PAD.left) / slot);
          setActive(Math.min(points.length - 1, Math.max(0, i)));
        }}
        onPointerLeave={() => setActive(null)}
      >
        <line
          x1={PAD.left}
          x2={width - PAD.right}
          y1={PAD.top + innerH}
          y2={PAD.top + innerH}
          stroke="var(--color-border)"
          strokeWidth="1"
        />
        <text x="2" y={PAD.top + 4} fontSize="9" fill="var(--color-muted)">
          {fmtAxis(max)}
        </text>

        {points.map((p, i) => {
          const h = Math.max(2, (p.value / max) * innerH);
          return (
            <rect
              key={i}
              x={PAD.left + i * slot + 1}
              y={PAD.top + innerH - h}
              width={barW}
              height={h}
              rx="3"
              fill="var(--color-chart)"
              opacity={active === null || active === i ? 1 : 0.45}
            />
          );
        })}

        <text x={PAD.left} y={height - 6} fontSize="9" fill="var(--color-muted)">
          {points[0].label}
        </text>
        <text
          x={width - PAD.right}
          y={height - 6}
          fontSize="9"
          textAnchor="end"
          fill="var(--color-muted)"
        >
          {points[points.length - 1].label}
        </text>
      </svg>

      <p className="mt-1 text-sm tabular-nums">
        <span className="font-semibold">{fmt(points[shown].value)}</span>{" "}
        <span className="text-muted">· {points[shown].label}{allDeloads ? ' (deload)' : ''}</span>
      </p>

      <ValueTable points={points} fmt={fmt} caption={title} />
    </div>
  );
}

/** A single headline number belongs in a tile, never a one-bar chart. */
export function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-4">
      <p className="text-xs tracking-wider text-muted uppercase">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function EmptyChart({ title }: { title: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
      Nothing to plot for {title.toLowerCase()} yet.
    </p>
  );
}
