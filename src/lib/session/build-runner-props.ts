/**
 * N6/N6s/N8: Extract runner props from session and user
 * 
 * Pure function to build SessionRunner props.
 * Tests ensure page call sites use correct fields.
 */

import type { Database } from "../database.types";

type Session = Database["public"]["Tables"]["sessions"]["Row"];
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
export function buildRunnerProps(session: Session, user: User): RunnerPropsCore {
  return {
    userId: user.id,          // N6
    sessionStatus: session.status,  // N6s
  };
}
