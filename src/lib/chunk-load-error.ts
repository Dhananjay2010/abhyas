/**
 * Detect if an error is a ChunkLoadError (failed dynamic import).
 *
 * This happens when:
 * - A user has an old deployment cached and visits after a new deploy
 * - A JS chunk they need no longer exists at its old URL
 * - The browser tries to load it and gets a 404
 *
 * Signs:
 * - error.name === 'ChunkLoadError'
 * - message includes 'Loading chunk', 'Failed to fetch dynamically imported module', or 'Importing a module script failed'
 */
export function isChunkLoadError(error: Error): boolean {
  if (error.name === "ChunkLoadError") {
    return true;
  }

  const message = error.message || "";
  return (
    message.includes("Loading chunk") ||
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed")
  );
}
