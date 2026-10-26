/**
 * Small browser-side helpers for the breathing screens.
 */

/**
 * A v4 UUID, used as a practice's log id so that a retried save is recognised
 * instead of recorded twice.
 *
 * `crypto.randomUUID` exists only in secure contexts, and a phone opening the
 * dev server over the LAN (http://192.168.x.x) is not one. `getRandomValues`
 * works everywhere.
 */
export function uuid(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * iPhone or iPad, including iPadOS, whose Safari presents itself as a Mac with
 * a touch screen. Read from the user agent rather than `navigator.platform`:
 * an Android phone emulated on a Mac keeps the host's "MacIntel" platform, and
 * a platform check took it for an iPad.
 */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Whether a practice was opened by a tap inside the app during this page
 * load, as opposed to a reload or a pasted link.
 *
 * It decides how the practice screen leaves. Opened from inside the app, the
 * page to return to is in the history stack, and going back to it keeps the
 * back button honest. Opened cold, there is nothing behind it but whatever
 * site came before, so it navigates to the Breathe tab instead.
 */
let startedInApp = false;

export function noteInAppStart(): void {
  startedInApp = true;
}

export function openedFromApp(): boolean {
  return startedInApp;
}
