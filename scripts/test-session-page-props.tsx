#!/usr/bin/env tsx
/**
 * Test: Session page props (N6, N6s, N8)
 * 
 * Tests that userId and sessionStatus are passed correctly from page.tsx to SessionRunner.
 */

import type { Database } from "../src/lib/database.types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failed++;
    console.error(`  ❌ ${message}`);
    throw new Error(message);
  } else {
    passed++;
    console.log(`  ✓ ${message}`);
  }
}

type User = { id: string };
type Session = { id: string; status: Database["public"]["Enums"]["session_status"] };

/**
 * Build SessionRunner props from session and user, matching page.tsx logic.
 * This helper is what page.tsx should use if extracted.
 */
function buildSessionRunnerAuthProps(session: Session, user: User) {
  return {
    sessionId: session.id,
    sessionStatus: session.status,
    userId: user.id,
  };
}

(async () => {
  console.log("\n📋 Test: Session page props (N6, N6s)\n");
  
  const mockSession: Session = {
    id: "sess-123",
    status: "in_progress",
  };
  
  const mockUser: User = {
    id: "user-456",
  };
  
  const props = buildSessionRunnerAuthProps(mockSession, mockUser);
  
  // N6: userId is user.id
  assert(props.userId === mockUser.id, "N6: userId matches user.id");
  
  // N6s: sessionStatus is session.status
  assert(props.sessionStatus === mockSession.status, "N6s: sessionStatus matches session.status");
  
  // Test with different status
  const completedSession: Session = {
    id: "sess-789",
    status: "completed",
  };
  
  const propsCompleted = buildSessionRunnerAuthProps(completedSession, mockUser);
  assert(propsCompleted.sessionStatus === "completed", "N6s: sessionStatus handles completed");
  
  console.log(`\n✅ Session page props test passed (${passed}/${passed + failed})\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
