/**
 * Execute the end-early sequence: flush, check, then end.
 * Pure async function for testability.
 */
export async function endEarlyWithFlush(params: {
  flush: () => Promise<void>;
  canEnd: () => boolean;
  end: () => Promise<boolean>;
  onBlockReason: (reason: string) => void;
}): Promise<boolean> {
  const { flush, canEnd, end, onBlockReason } = params;

  // 1. Flush first
  await flush();

  // 2. Check if we can end (no unsynced sets)
  if (!canEnd()) {
    onBlockReason("Sets haven't synced yet. Wait for them, or remove them first.");
    return false;
  }

  // 3. End session
  return await end();
}
