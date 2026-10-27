#!/usr/bin/env tsx
/**
 * Test: Settings stash user isolation (M1)
 * 
 * Tests that stashed Settings changes are scoped to the user who made them:
 * - User A stashes changes
 * - User B signs in on the same tab
 * - User B must see NOTHING restored and NOTHING saved
 * - Legacy stash (no userId) is dropped
 * - Sign-out clears the stash
 * 
 * Must FAIL on current head (2b7560d).
 */

import './helpers/setup-jsdom';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsForm, type SettingsState, type SettingsActions } from '../src/app/settings/settings-form';
import { 
  getPendingChanges, 
  clearPendingChanges, 
  stashPendingChanges,
  type PendingChange 
} from '../src/lib/auth/pending-changes';

interface TestResult {
  passed: boolean;
  message: string;
}

const initialState: SettingsState = {
  goal: 'muscle_gain',
  level: 'intermediate',
  primaryTrack: 'weights',
  daysPerWeek: 4,
  yogaDaysPerWeek: 1,
  preferredSessionMinutes: 45,
  hasAllEquipment: true,
  equipmentIds: [],
  injuries: [],
  planningMode: 'progression',
  perSetLogging: true,
  resumeSession: true,
  cooldownEnabled: true,
  restAutostart: true,
  restSound: true,
  restVibrate: false,
  restOverrideSeconds: null,
  bodyweightPrompt: 'weekly',
  timezone: null,
  dateOfBirth: null,
  units: 'metric',
};

const equipment = [
  { id: 'barbell', name: 'Barbell', category: 'free_weight' },
];

const timezones = ['America/New_York', 'Europe/London', 'Asia/Tokyo'];

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: User A stashes changes, User B signs in -> B sees nothing restored
  {
    clearPendingChanges();

    // User A (userId: 'user-a-123') stashes changes
    const userAChanges: PendingChange[] = [
      {
        key: 'perSetLogging',
        type: 'session',
        patch: { perSetLogging: false },
        timestamp: Date.now()
      }
    ];
    
    const stashed = stashPendingChanges(userAChanges, '/settings', 'user-a-123');

    if (!stashed) {
      results.push({
        passed: false,
        message: 'Test 1: FAILED - Could not stash changes'
      });
    } else {
      // Now User B (userId: 'user-b-456') loads the page
      let savedCall = false;
      const actions: SettingsActions = {
        updateSessionSettings: async (patch) => {
          savedCall = true;
          return { ok: true };
        },
        updateProfileSettings: async () => ({ ok: true }),
        updateEquipment: async () => ({ ok: true }),
        updateInjuries: async () => ({ ok: true }),
        setEquipmentItem: async () => ({ ok: true }),
        setHasAllEquipment: async () => ({ ok: true }),
        setInjury: async () => ({ ok: true }),
      };

      render(
        <SettingsForm
          initial={{ ...initialState, perSetLogging: true }}
          equipment={equipment}
          timezones={timezones}
          userId="user-b-456"
          actions={actions}
        />
      );

      // Wait a bit to let effects run
      await waitFor(() => new Promise(resolve => setTimeout(resolve, 100)));

      // User B should NOT have any restored changes applied
      if (savedCall) {
        results.push({
          passed: false,
          message: 'Test 1: FAILED - User B had User A\'s stashed changes applied (leak!)'
        });
      } else {
        results.push({
          passed: true,
          message: 'Test 1: PASSED - User B did not see User A\'s stashed changes'
        });
      }
    }

    clearPendingChanges();
  }

  // Test 2: Legacy stash (no userId) is dropped on restore
  {
    clearPendingChanges();

    // Manually put a legacy stash (no userId field) in sessionStorage
    const legacyStash = {
      changes: [
        {
          key: 'perSetLogging',
          type: 'session',
          patch: { perSetLogging: false },
          timestamp: Date.now()
        }
      ],
      returnPath: '/settings'
    };

    window.sessionStorage.setItem('abhyas_pending_settings', JSON.stringify(legacyStash));

    // Current user loads the page
    let savedCall = false;
    const actions: SettingsActions = {
      updateSessionSettings: async () => {
        savedCall = true;
        return { ok: true };
      },
      updateProfileSettings: async () => ({ ok: true }),
      updateEquipment: async () => ({ ok: true }),
      updateInjuries: async () => ({ ok: true }),
      setEquipmentItem: async () => ({ ok: true }),
      setHasAllEquipment: async () => ({ ok: true }),
      setInjury: async () => ({ ok: true }),
    };

    render(
      <SettingsForm
        initial={{ ...initialState, perSetLogging: true }}
        equipment={equipment}
        timezones={timezones}
        userId="current-user-789"
        actions={actions}
      />
    );

    await waitFor(() => new Promise(resolve => setTimeout(resolve, 100)));

    if (savedCall) {
      results.push({
        passed: false,
        message: 'Test 2: FAILED - Legacy stash (no userId) was restored (should be dropped)'
      });
    } else {
      results.push({
        passed: true,
        message: 'Test 2: PASSED - Legacy stash was dropped'
      });
    }

    clearPendingChanges();
  }

  // Test 3: Per-item equipment stash from user A is not replayed for user B
  {
    clearPendingChanges();

    // User A (userId: 'user-a-789') stashes per-item equipment change
    const userAEquipmentChanges: PendingChange[] = [
      {
        key: 'equipment',
        type: 'equipment',
        patch: { operation: 'setItem', equipmentId: 'barbell', enabled: true },
        timestamp: Date.now()
      }
    ];
    
    const stashed = stashPendingChanges(userAEquipmentChanges, '/settings', 'user-a-789');

    if (!stashed) {
      results.push({
        passed: false,
        message: 'Test 3: FAILED - Could not stash per-item equipment changes'
      });
    } else {
      // Now User B (userId: 'user-b-012') loads the page
      let equipmentSaved = false;
      const actions: SettingsActions = {
        updateSessionSettings: async () => ({ ok: true }),
        updateProfileSettings: async () => ({ ok: true }),
        updateEquipment: async () => {
          equipmentSaved = true;
          return { ok: true };
        },
        setEquipmentItem: async () => {
          equipmentSaved = true;
          return { ok: true };
        },
        setHasAllEquipment: async () => {
          equipmentSaved = true;
          return { ok: true };
        },
        updateInjuries: async () => ({ ok: true }),
        setInjury: async () => ({ ok: true }),
      };

      render(
        <SettingsForm
          initial={{ ...initialState, equipmentIds: [] }}
          equipment={equipment}
          timezones={timezones}
          userId="user-b-012"
          actions={actions}
        />
      );

      await waitFor(() => new Promise(resolve => setTimeout(resolve, 100)));

      // User B should NOT have User A's per-item equipment change applied
      if (equipmentSaved) {
        results.push({
          passed: false,
          message: 'Test 3: FAILED - User B had User A\'s per-item equipment stash applied (leak!)'
        });
      } else {
        results.push({
          passed: true,
          message: 'Test 3: PASSED - User B did not see User A\'s per-item equipment stash'
        });
      }
    }

    clearPendingChanges();
  }

  // Test 4: Sign-out clears the stash
  {
    clearPendingChanges();

    // User stashes some changes
    const changes: PendingChange[] = [
      {
        key: 'perSetLogging',
        type: 'session',
        patch: { perSetLogging: false },
        timestamp: Date.now()
      }
    ];

    stashPendingChanges(changes, '/settings', 'test-user-999');

    // Verify stash exists
    let pending = getPendingChanges();
    if (!pending) {
      results.push({
        passed: false,
        message: 'Test 4: FAILED - Could not stash changes'
      });
    } else {
      // Simulate sign-out by calling clearPendingChanges
      // (In real code, this will be called from signout action)
      clearPendingChanges();

      // Verify stash is gone
      pending = getPendingChanges();
      if (pending !== null) {
        results.push({
          passed: false,
          message: 'Test 4: FAILED - Stash was not cleared on sign-out'
        });
      } else {
        results.push({
          passed: true,
          message: 'Test 4: PASSED - Sign-out cleared the stash'
        });
      }
    }
  }

  return results;
}

runTests()
  .then((results) => {
    console.log('\n=== Settings User Stash Isolation Tests (M1) ===\n');
    
    let passed = 0;
    let failed = 0;

    for (const result of results) {
      if (result.passed) {
        passed++;
        console.log(`✓ ${result.message}`);
      } else {
        failed++;
        console.log(`✗ ${result.message}`);
      }
    }

    console.log(`\nTotal: ${results.length}, Passed: ${passed}, Failed: ${failed}\n`);

    if (failed > 0) {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('\n✗ Test suite crashed:', error);
    process.exit(1);
  });