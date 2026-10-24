/**
 * Account deletion tests
 * 
 * Tests the delete_own_account() RPC function to ensure:
 * 1. Only the authenticated user can delete their own account
 * 2. All user data is properly deleted (via cascades)
 * 3. The auth.users row is deleted
 * 
 * This test requires a live Supabase connection and cannot run in isolation.
 * It is intended for manual verification before deployment.
 * 
 * Run with: npx tsx scripts/test-account-deletion.ts
 */

console.log("\n⚠️  Account Deletion Test Suite");
console.log("=====================================");
console.log("This test suite is for manual verification only.");
console.log("It requires a live Supabase connection and will create/delete test users.");
console.log("\nTo run these tests:");
console.log("1. Set up a test Supabase project");
console.log("2. Apply all migrations including 20261024000000_account_deletion.sql");
console.log("3. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables");
console.log("4. Create test users through the application");
console.log("5. Verify the following behaviors manually:\n");

console.log("✓ Test 1: Authenticated user can delete their own account");
console.log("  - Sign in as a test user");
console.log("  - Navigate to Settings > Delete Account");
console.log("  - Type 'DELETE' in the confirmation field");
console.log("  - Click 'Delete my account'");
console.log("  - Verify: redirected to landing page");
console.log("  - Verify: cannot sign in with the deleted account");
console.log("  - Verify: all data is removed from the database\n");

console.log("✓ Test 2: Cascading deletes work correctly");
console.log("  - Create a test user with complete data:");
console.log("    - Profile with onboarding completed");
console.log("    - User settings");
console.log("    - Equipment preferences");
console.log("    - Injuries");
console.log("    - At least one program with program_days and program_day_exercises");
console.log("    - At least one session with session_exercises and session_sets");
console.log("    - Exercise progress records");
console.log("    - Body metrics");
console.log("    - Yoga progress");
console.log("  - Delete the account");
console.log("  - Query the database to verify all rows are gone:");

const queries = [
  "SELECT count(*) FROM profiles WHERE id = $userId",
  "SELECT count(*) FROM user_settings WHERE user_id = $userId",
  "SELECT count(*) FROM user_equipment WHERE user_id = $userId",
  "SELECT count(*) FROM user_injuries WHERE user_id = $userId",
  "SELECT count(*) FROM programs WHERE user_id = $userId",
  "SELECT count(*) FROM program_days WHERE user_id = $userId",
  "SELECT count(*) FROM program_day_exercises WHERE user_id = $userId",
  "SELECT count(*) FROM sessions WHERE user_id = $userId",
  "SELECT count(*) FROM session_exercises WHERE user_id = $userId",
  "SELECT count(*) FROM session_sets WHERE user_id = $userId",
  "SELECT count(*) FROM exercise_progress WHERE user_id = $userId",
  "SELECT count(*) FROM body_metrics WHERE user_id = $userId",
  "SELECT count(*) FROM user_yoga_progress WHERE user_id = $userId",
  "SELECT count(*) FROM auth.users WHERE id = $userId",
];

queries.forEach((q) => console.log(`    ${q}`));
console.log("  - All counts should be 0\n");

console.log("✓ Test 3: Unauthenticated user cannot delete accounts");
console.log("  - Make a direct RPC call without authentication:");
console.log("    curl -X POST '<SUPABASE_URL>/rest/v1/rpc/delete_own_account' \\");
console.log("      -H 'apikey: <ANON_KEY>' \\");
console.log("      -H 'Content-Type: application/json'");
console.log("  - Verify: returns 401 or error 'Not authenticated'\n");

console.log("✓ Test 4: Confirmation word is required");
console.log("  - Navigate to Settings > Delete Account");
console.log("  - Try to click 'Delete my account' without typing 'DELETE'");
console.log("  - Verify: button is disabled");
console.log("  - Type something else (e.g., 'delete', 'yes')");
console.log("  - Verify: button remains disabled");
console.log("  - Type 'DELETE' exactly");
console.log("  - Verify: button becomes enabled\n");

console.log("✓ Test 5: Cancel flow works");
console.log("  - Navigate to Settings > Delete Account");
console.log("  - Click 'Cancel'");
console.log("  - Verify: returns to Settings page");
console.log("  - Verify: account is not deleted\n");

console.log("✓ Test 6: Error handling");
console.log("  - Simulate network failure or database error");
console.log("  - Verify: error message is displayed to the user");
console.log("  - Verify: user is not signed out");
console.log("  - Verify: account is not deleted\n");

console.log("✓ Test 7: UI accessibility");
console.log("  - Navigate to Settings > Delete Account");
console.log("  - Verify: warning message is clearly visible");
console.log("  - Verify: list of data to be deleted is comprehensive");
console.log("  - Verify: confirmation input has appropriate autocomplete attributes");
console.log("  - Verify: buttons have appropriate disabled states\n");

console.log("✓ Test 8: Legal pages are accessible");
console.log("  - Visit /privacy");
console.log("  - Verify: Privacy Policy loads");
console.log("  - Verify: Draft warning is visible");
console.log("  - Visit /terms");
console.log("  - Verify: Terms of Service loads");
console.log("  - Verify: Draft warning is visible");
console.log("  - From Settings, click Privacy Policy link");
console.log("  - Verify: opens in new tab");
console.log("  - From Settings, click Terms of Service link");
console.log("  - Verify: opens in new tab\n");

console.log("✓ Test 9: Footer appears on appropriate pages");
console.log("  - Visit / (landing page)");
console.log("  - Verify: footer with disclaimer and legal links is visible");
console.log("  - Visit /privacy or /terms");
console.log("  - Verify: footer is NOT duplicated (these pages have their own structure)");
console.log("  - Visit /today, /settings, /history, etc. (authenticated pages)");
console.log("  - Verify: bottom nav is present, not footer");
console.log("  - Visit /onboarding");
console.log("  - Verify: no footer (full-screen flow)\n");

console.log("✓ Test 10: Onboarding legal links");
console.log("  - Sign out and start fresh onboarding");
console.log("  - On the disclaimer step, verify:");
console.log("  - 'By continuing, you agree...' text is present");
console.log("  - Terms of Service link opens in new tab");
console.log("  - Privacy Policy link opens in new tab");
console.log("  - Links work without disrupting onboarding flow\n");

console.log("=====================================");
console.log("Manual verification checklist complete.\n");

process.exit(0);
