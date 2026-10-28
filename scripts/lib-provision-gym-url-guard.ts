/**
 * URL guard for provision-gym script.
 * Checks if a URL is localhost/127.0.0.1/::1.
 */

export function isLocalhostUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    const hostname = parsed.hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}
