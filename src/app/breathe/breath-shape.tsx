"use client";

import { forwardRef, useId, useImperativeHandle, useRef } from "react";
import type { PhaseKind, Side } from "@/lib/breathing/engine";
import type { Shape } from "@/lib/breathing/pattern";

/**
 * The thing you watch while you breathe.
 *
 * Every practice used to be the same circle, which meant the screen told you
 * nothing about which practice you were doing. Each one now has a shape that
 * matches what it actually is: four equal sides for the box, two lobes for
 * alternate nostrils, a teardrop for the ones weighted to the exhale, rings
 * spreading outward for the hum, a flash per pump for Kapalabhati.
 *
 * All of them are driven by the same two numbers the engine already returns --
 * the eased size and the progress through the phase -- and all of them are
 * written straight to the DOM from the practice's frame callback, never
 * through React. `paint` is the whole interface.
 */

/** Everything a shape needs from one frame. */
export type ShapeFrame = {
  /** The eased orb size, 0..1. */
  size: number;
  /** Through the current phase, 0..1. */
  progress: number;
  /** Through the whole cycle, 0..1. The square traces this, one side a phase. */
  cycleProgress: number;
  kind: PhaseKind;
  /** Which nostril is open, for the lobes. */
  side: Side | null;
};

export type ShapeHandle = { paint: (frame: ShapeFrame) => void };

/** The box the shape is drawn in. Everything below is in these coordinates. */
const BOX = 300;
const MID = BOX / 2;

/**
 * A teardrop: round at the bottom, drawn to a point at the top. Weighted the
 * way a long exhale feels -- most of the body low, the last of it tapering.
 */
const TEARDROP =
  "M150 42 C150 42 226 128 226 180 A76 76 0 1 1 74 180 C74 128 150 42 150 42 Z";

const STROKE = "#6fd8d2";
const TRACK = "rgba(220, 243, 241, 0.1)";

/** A body element that the painter scales about the middle of the box. */
const bodyStyle = { transformOrigin: `${MID}px ${MID}px`, transformBox: "view-box" } as const;

export const BreathShape = forwardRef<
  ShapeHandle,
  { shape: Shape; reduced: boolean; className?: string }
>(function BreathShape({ shape, reduced, className = "" }, ref) {
  // Several of these can be on screen at once (the practice list), and an SVG
  // gradient is addressed by id, so each instance needs its own.
  const uid = useId().replace(/:/g, "");
  const fill = `breath-body-${uid}`;

  const ringRef = useRef<SVGGeometryElement>(null);
  const bodyRef = useRef<SVGGraphicsElement>(null);
  const leftRef = useRef<SVGEllipseElement>(null);
  const rightRef = useRef<SVGEllipseElement>(null);
  const ripplesRef = useRef<SVGGElement>(null);
  const burstRef = useRef<SVGCircleElement>(null);

  useImperativeHandle(
    ref,
    (): ShapeHandle => ({
      paint({ size, progress, cycleProgress, kind, side }) {
        // The ring. The square traces the whole cycle, one side a phase, which
        // is the thing box breathing is recognised by; everything else fills
        // over the phase it is in.
        const ring = ringRef.current;
        if (ring) {
          ring.style.strokeDashoffset = String(1 - (shape === "square" ? cycleProgress : progress));
        }

        // The body. Reduced motion gets the same information as brightness
        // rather than as movement.
        const scale = reduced ? 0.84 : 0.42 + 0.58 * size;
        const opacity = reduced ? 0.35 + 0.65 * size : 1;

        if (shape === "lobes") {
          // Both lobes breathe; the open one is lit. A hold has no side, so
          // neither is favoured and the pair simply holds its size.
          for (const [el, which] of [
            [leftRef.current, "left"],
            [rightRef.current, "right"],
          ] as const) {
            if (!el) continue;
            el.style.transform = `scale(${scale})`;
            const lit = side === null ? 0.62 : side === which ? 1 : 0.24;
            el.style.opacity = String(lit * opacity);
          }
        } else if (bodyRef.current) {
          bodyRef.current.style.transform = `scale(${scale})`;
          bodyRef.current.style.opacity = String(opacity);
        }

        // Rings spreading outward, for the hum. They run on the exhale and are
        // still between breaths, so the ripples mean "you are humming now".
        if (ripplesRef.current) {
          const humming = kind === "exhale";
          const g = ripplesRef.current;
          for (let i = 0; i < g.children.length; i++) {
            const circle = g.children[i] as SVGCircleElement;
            if (!humming || reduced) {
              circle.style.opacity = "0";
              continue;
            }
            // Three rings, evenly staggered, each expanding and fading.
            const t = (progress * 2 + i / g.children.length) % 1;
            circle.setAttribute("r", String(58 + t * 88));
            circle.style.opacity = String(0.45 * (1 - t));
          }
        }

        // A flash on every pump. The size already oscillates between the two
        // pumping bounds, so the flash is read off it rather than plumbed
        // through as a second number.
        if (burstRef.current) {
          const flash = kind === "pump" && !reduced ? (size - PUMP_LOW) / (PUMP_HIGH - PUMP_LOW) : 0;
          burstRef.current.style.opacity = String(0.5 * Math.max(0, Math.min(1, flash)));
          burstRef.current.setAttribute("r", String(104 + 26 * flash));
        }
      },
    }),
    [shape, reduced],
  );

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${BOX} ${BOX}`}
      className={`h-full w-full ${className}`}
    >
      <defs>
        <radialGradient id={fill} cx="36%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#dcfbf8" />
          <stop offset="26%" stopColor="#86e2dc" />
          <stop offset="62%" stopColor="#36a3b3" />
          <stop offset="100%" stopColor="#1d5f7c" />
        </radialGradient>
      </defs>

      {/*
        The ring, and the track behind it. `pathLength` normalises whatever
        outline this shape has to 1, so the painter writes a fraction and never
        has to know a circumference or measure a path.
      */}
      {shape === "square" ? (
        <>
          <rect x="8" y="8" width="284" height="284" rx="30" fill="none" stroke={TRACK} strokeWidth="2.5" />
          <rect
            ref={ringRef as React.Ref<SVGRectElement>}
            x="8"
            y="8"
            width="284"
            height="284"
            rx="30"
            fill="none"
            stroke={STROKE}
            strokeWidth="2.5"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={1}
          />
        </>
      ) : (
        <g transform={`rotate(-90 ${MID} ${MID})`}>
          <circle cx={MID} cy={MID} r="146" fill="none" stroke={TRACK} strokeWidth="2.5" />
          <circle
            ref={ringRef as React.Ref<SVGCircleElement>}
            cx={MID}
            cy={MID}
            r="146"
            fill="none"
            stroke={STROKE}
            strokeWidth="2.5"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={1}
          />
        </g>
      )}

      {shape === "pulse" && (
        <circle ref={burstRef} cx={MID} cy={MID} r="104" fill="none" stroke={STROKE} strokeWidth="10" opacity="0" />
      )}

      {shape === "ripple" && (
        <g ref={ripplesRef}>
          <circle cx={MID} cy={MID} r="58" fill="none" stroke={STROKE} strokeWidth="2" opacity="0" />
          <circle cx={MID} cy={MID} r="58" fill="none" stroke={STROKE} strokeWidth="2" opacity="0" />
          <circle cx={MID} cy={MID} r="58" fill="none" stroke={STROKE} strokeWidth="2" opacity="0" />
        </g>
      )}

      {shape === "lobes" ? (
        <>
          <ellipse ref={leftRef} cx="102" cy={MID} rx="54" ry="82" fill={`url(#${fill})`} style={bodyStyle} />
          <ellipse ref={rightRef} cx="198" cy={MID} rx="54" ry="82" fill={`url(#${fill})`} style={bodyStyle} />
        </>
      ) : shape === "square" ? (
        <rect
          ref={bodyRef as React.Ref<SVGRectElement>}
          x="46"
          y="46"
          width="208"
          height="208"
          rx="30"
          fill={`url(#${fill})`}
          style={bodyStyle}
        />
      ) : shape === "teardrop" ? (
        <path ref={bodyRef as React.Ref<SVGPathElement>} d={TEARDROP} fill={`url(#${fill})`} style={bodyStyle} />
      ) : (
        <circle
          ref={bodyRef as React.Ref<SVGCircleElement>}
          cx={MID}
          cy={MID}
          r="104"
          fill={`url(#${fill})`}
          style={bodyStyle}
        />
      )}
    </svg>
  );
});

/**
 * The bounds a pump swings the size between, mirroring the engine's own.
 * Kept here rather than exported from the engine because this is a drawing
 * decision: it is how bright the flash is, not how big the breath is.
 */
const PUMP_LOW = 0.22;
const PUMP_HIGH = 0.5;
