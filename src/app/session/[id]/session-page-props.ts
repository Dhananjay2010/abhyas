/**
 * Session page props mapping.
 * 
 * Extract props for testability.
 */

/**
 * Get userId prop for SessionRunner.
 * 
 * This function exists to ensure the userId is actually passed to the runner.
 * Without it, the controller would get an empty string and store pending sets
 * under the wrong key.
 */
export function getSessionRunnerUserId(user: { id: string }): string {
  return user.id;
}
