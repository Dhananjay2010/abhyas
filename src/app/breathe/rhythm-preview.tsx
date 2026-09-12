"use client";

import { useEffect, useMemo, useRef } from "react";
import { buildCycle, positionAt, type BreathPhase } from "@/lib/breathing/engine";
import type { Shape } from "@/lib/breathing/pattern";
import { ORB_BG } from "@/lib/breathing/theme";
import { usePrefersReducedMotion } from "./use-media";

const scaleFor = (size: number) => 0.42 + 0.58 * size;

/**
 * The silhouette each shape shows at card size.
 *
 * The practice screen draws the real thing -- a ring traced one side a phase,
 * lobes that light, ripples that spread. None of that reads at fifty pixels.
 * What does read is the outline, so the card carries the silhouette and the
 * rhythm, which together are enough to tell two practices apart at a glance.
 */
const OUTLINE: Record<Shape, string> = {
  orb: "50%",
  square: "24%",
  // Round on three corners and square on the fourth, turned so the point is at
  // the top: a teardrop.
  teardrop: "50% 50% 50% 0",
  lobes: "50%",
  ripple: "50%",
  pulse: "50%",
};

/**
 * A small shape breathing the pattern's real rhythm, so a practice shows what
 * it feels like instead of describing itself as "4-7-8".
 *
 * Built from the same cycle the player uses, as a Web Animations keyframe list:
 * one keyframe per phase boundary, eased on the breaths and linear on the
 * holds. It runs on the compositor, so a whole list of them costs nothing.
 */
export function RhythmPreview({
  phases,
  shape = "orb",
  size = 52,
  className = "",
}: {
  phases: BreathPhase[];
  shape?: Shape;
  size?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const cycle = useMemo(() => buildCycle(phases), [phases]);

  // A teardrop is a square with three rounded corners, turned to stand on its
  // point, so its rotation has to ride along with every scale keyframe.
  const turn = shape === "teardrop" ? "rotate(-45deg) " : "";

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || typeof el.animate !== "function") return;
    const frames: Keyframe[] = [];
    for (const p of cycle.phases) {
      // A pump phase is not a journey from one size to another, so one
      // keyframe at its start would show Kapalabhati as a slow drift -- which
      // is the opposite of what it is. Sampled twice a pump instead, through
      // the engine, so the preview pumps the way the practice does.
      if (p.kind === "pump") {
        for (let k = 0; k < p.pumps * 2; k++) {
          const at = p.offset + k / (2 * p.rate);
          frames.push({
            offset: Math.min(1, at / cycle.seconds),
            transform: `${turn}scale(${scaleFor(positionAt(cycle, 1, at).size)})`,
            easing: "ease-in-out",
          });
        }
        continue;
      }
      frames.push({
        offset: p.offset / cycle.seconds,
        transform: `${turn}scale(${scaleFor(p.from)})`,
        easing: p.kind === "hold" || p.kind === "rest" ? "linear" : "ease-in-out",
      });
    }
    frames.push({
      offset: 1,
      transform: `${turn}scale(${scaleFor(cycle.phases[cycle.phases.length - 1].to)})`,
    });
    const animation = el.animate(frames, { duration: cycle.seconds * 1000, iterations: Infinity });
    return () => animation.cancel();
  }, [cycle, reduced, turn]);

  const body = size * 0.86;
  const resting = `${turn}scale(${reduced ? 0.8 : scaleFor(cycle.phases[0].from)})`;

  return (
    <div
      aria-hidden="true"
      className={`relative grid shrink-0 place-items-center rounded-full bg-breath/10 ${className}`}
      style={{ width: size, height: size }}
    >
      {/* The hum's ripples do not animate this small; one still ring says
          "this is the one that rings" without competing with the rhythm. */}
      {shape === "ripple" && (
        <span
          className="absolute rounded-full border"
          style={{
            width: body,
            height: body,
            borderColor: "rgba(111, 216, 210, 0.45)",
          }}
        />
      )}
      <div
        ref={ref}
        className="grid place-items-center"
        style={{
          width: body,
          height: body,
          borderRadius: shape === "lobes" ? undefined : OUTLINE[shape],
          background: shape === "lobes" ? undefined : ORB_BG,
          boxShadow:
            shape === "lobes" ? undefined : `0 0 ${Math.round(size / 5)}px rgba(111, 216, 210, 0.35)`,
          transform: resting,
        }}
      >
        {shape === "lobes" && (
          // Two lobes, the pair breathing together. Which one is open is a
          // thing the practice screen shows; at this size it would be a smudge.
          <span className="flex h-full w-full items-center justify-center gap-[8%]">
            {[0, 1].map((i) => (
              <span
                key={i}
                className="h-full rounded-full"
                style={{ width: "42%", background: ORB_BG }}
              />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
