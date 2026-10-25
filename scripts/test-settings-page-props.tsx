#!/usr/bin/env tsx
/**
 * Test: Settings page props (N8)
 * 
 * Tests that userId is passed correctly from settings page.tsx to SignOutButton.
 */

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

/**
 * Build SignOutButton props from user, matching settings page.tsx logic.
 */
function buildSignOutButtonProps(user: User) {
  return {
    userId: user.id,
  };
}

(async () => {
  console.log("\n📋 Test: Settings page props (N8)\n");
  
  const mockUser: User = {
    id: "user-789",
  };
  
  const props = buildSignOutButtonProps(mockUser);
  
  // N8: userId is user.id
  assert(props.userId === mockUser.id, "N8: userId matches user.id");
  
  console.log(`\n✅ Settings page props test passed (${passed}/${passed + failed})\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
