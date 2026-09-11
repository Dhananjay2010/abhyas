/**
 * A stopwatch that can be paused.
 *
 * The practice player derives everything it shows from `elapsed()`, so this is
 * the only moving part in a session. Time spent paused is simply never
 * counted. `now` is injectable so the tests can drive it without waiting.
 */
export class PausableClock {
  private runningSince: number | null = null;
  private banked = 0;

  constructor(private readonly now: () => number = () => performance.now()) {}

  get running(): boolean {
    return this.runningSince !== null;
  }

  /** Start, or carry on after a pause. Calling it while running changes nothing. */
  resume(): void {
    if (this.runningSince === null) this.runningSince = this.now();
  }

  pause(): void {
    if (this.runningSince === null) return;
    this.banked += (this.now() - this.runningSince) / 1000;
    this.runningSince = null;
  }

  /** Seconds counted so far. */
  elapsed(): number {
    const live = this.runningSince === null ? 0 : (this.now() - this.runningSince) / 1000;
    return this.banked + live;
  }

  /** Move forward without waiting, e.g. to skip the rest of the settle-in. */
  advance(seconds: number): void {
    this.banked += Math.max(0, seconds);
  }
}
