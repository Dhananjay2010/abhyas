/**
 * Derive the sync banner state from outbox status.
 * Pure function for testability.
 */
export function deriveOutboxBanner(params: {
  online: boolean;
  pending: number;
  failed: number;
}): {
  kind: "offline" | "failed" | null;
  message: string | null;
  failedCount: number;
} {
  const { online, pending, failed } = params;

  // Show offline banner when offline and have pending sets
  if (!online && pending > 0) {
    return {
      kind: "offline",
      message: "You're offline. Sets will sync when you're back online.",
      failedCount: failed,
    };
  }

  // Show failed banner when online but have failed sets
  if (online && failed > 0) {
    return {
      kind: "failed",
      message: `${failed} set${failed > 1 ? "s" : ""} couldn't sync. Tap to retry or remove.`,
      failedCount: failed,
    };
  }

  // All clear
  return {
    kind: null,
    message: null,
    failedCount: failed,
  };
}
