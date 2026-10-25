/**
 * N6/N6s/N8: Extract props from session and user
 * 
 * Pure functions to build page props.
 * Tests ensure page call sites use correct fields.
 */

import type { Database } from "../database.types";

type SessionLike = { status: Database["public"]["Enums"]["session_status"] };
type User = { id: string };

export interface RunnerPropsCore {
  userId: string;
  sessionStatus: Database["public"]["Enums"]["session_status"];
}

/**
 * Extract core props for SessionRunner from session and user.
 * N6: userId must be user.id
 * N6s: sessionStatus must be session.status
 */
export function buildRunnerProps(session: SessionLike, user: User): RunnerPropsCore {
  return {
    userId: user.id,          // N6
    sessionStatus: session.status,  // N6s
  };
}

/**
 * Extract userId for settings page.
 * N8: userId must be user.id
 */
export function buildSettingsProps(user: User): { userId: string } {
  return {
    userId: user.id,  // N8
  };
}
