/**
 * The breathing session's look, in one place.
 *
 * A plain module rather than part of a component file: the loading skeletons
 * are server components, and a value exported from a "use client" module
 * reaches a server component as a reference, not as the string.
 */

/** Deep navy, lighter where the orb sits. */
export const SESSION_BG =
  "radial-gradient(120% 85% at 50% 36%, #12324a 0%, #0b1622 55%, #070b12 100%)";

/** Laid over the background; its opacity follows the breath, so the room brightens as you fill. */
export const HALO_BG =
  "radial-gradient(circle at 50% 42%, rgba(111, 216, 210, 0.2), transparent 58%)";

/** The soft light around the orb. */
export const GLOW_BG =
  "radial-gradient(circle, rgba(111, 216, 210, 0.55) 0%, rgba(111, 216, 210, 0) 68%)";

/** The orb itself: lit from the upper left, deepening to teal. */
export const ORB_BG =
  "radial-gradient(circle at 36% 30%, #dcfbf8 0%, #86e2dc 26%, #36a3b3 62%, #1d5f7c 100%)";

/** Cards on the Breathe tab that lead into a practice. */
export const CARD_BG = "linear-gradient(135deg, #11293b 0%, #0d1c28 55%, #151a1f 100%)";

/** The ring around the orb that fills over each phase. */
export const RING_R = 146;
export const RING_C = 2 * Math.PI * RING_R;
