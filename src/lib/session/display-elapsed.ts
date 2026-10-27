export function displayElapsed(rawElapsed: number, isStale: boolean): number {
  return isStale ? 0 : rawElapsed;
}
