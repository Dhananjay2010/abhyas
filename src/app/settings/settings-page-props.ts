/**
 * Settings page props mapping.
 * 
 * Extract props for testability.
 */

/**
 * Get userId prop for SignOutButton.
 * 
 * This function exists to ensure the userId is actually passed to SignOutButton.
 * Without it, the button would clear pending sets under the wrong key.
 */
export function getSignOutButtonUserId(user: { id: string }): string {
  return user.id;
}
