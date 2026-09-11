"use client";

import { useEffect, useMemo, useRef } from "react";
import { buildCycle, type BreathPhase } from "@/lib/breathing/engine";
import { ORB_BG } from "@/lib/breathing/theme";
import { usePrefersReducedMotion } from "./use-media";

const scaleFor = (size: number) => 0.42 + 0.58 * size;

/**
 * A small orb breathing the pattern's real rhythm, so a practice shows what it
 * feels like instead of describing itself as "4-7-8".
 *
 * Built from the same cycle the player uses, as a Web Animations keyframe list:
 * one keyframe per phase boundary, eased on the breaths and linear on the
 * holds. It runs on the compositor, so a whole list of them costs nothing.
 */
export function RhythmPreview({
  phases,
  size = 52,
  className = "",
}: {
  phases: BreathPhase[];
  size?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const cycle = useMemo(() => buildCycle(phases), [phases]);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || typeof el.animate !== "function") return;
    const frames: Keyframe[] = cycle.phases.map((p) => ({
      offset: p.offset / cycle.seconds,
      transform: `scale(${scaleFor(p.from)})`,
      easing: p.kind === "hold" ? "linear" : "ease-in-out",
    }));
    frames.push({
      offset: 1,
      transform: `scale(${scaleFor(cycle.phases[cycle.phases.length - 1].to)})`,
    });
    const animation = el.animate(frames, { duration: cycle.seconds * 1000, iterations: Infinity });
    return () => animation.cancel();
  }, [cycle, reduced]);

  return (
    <div
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-breath/10 ${className}`}
      style={{ width: size, height: size }}
    >
      <div
        ref={ref}
        className="rounded-full"
        style={{
          width: size * 0.86,
          height: size * 0.86,
          background: ORB_BG,
          boxShadow: `0 0 ${Math.round(size / 5)}px rgba(111, 216, 210, 0.35)`,
          transform: `scale(${reduced ? 0.8 : scaleFor(cycle.phases[0].from)})`,
        }}
      />
    </div>
  );
}
