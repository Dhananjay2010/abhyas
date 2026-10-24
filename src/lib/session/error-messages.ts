/**
 * Map Postgres error codes and raw error text to user-friendly messages.
 * 
 * Pure function for testability.
 */
export function mapErrorToUserMessage(code: string | null | undefined, rawMessage?: string): string {
  // Check for specific Postgres error codes
  if (code) {
    // 22P02: Invalid text representation (e.g. "SELECT '123abc'::integer")
    // 22003: Numeric value out of range
    // 23514: Check constraint violation
    if (code === "22P02" || code === "22003" || code === "23514") {
      return "Not saved, check the numbers";
    }
    
    // 42501: Insufficient privilege
    if (code === "42501") {
      return "Not saved, please sign in again";
    }
  }
  
  // Map raw text
  if (rawMessage) {
    const lower = rawMessage.toLowerCase();
    if (lower.includes("quota") || lower === "quota_exceeded") {
      return "Not saved, out of space";
    }
  }
  
  // Default message for any other error
  return "Not saved, tap Retry";
}
