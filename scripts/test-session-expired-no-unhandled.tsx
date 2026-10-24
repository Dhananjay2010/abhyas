#!/usr/bin/env tsx
/**
 * Test: Session expired actions don't raise unhandled rejections (L2)
 * 
 * Tests that when a server action throws SESSION_EXPIRED, it's properly caught
 * and doesn't result in an unhandled promise rejection or page error.
 * 
 * Behavioral test: actually runs the queue with a rejecting action.
 */

import './helpers/setup-jsdom';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsForm, type SettingsState, type SettingsActions } from '../src/app/settings/settings-form';
import { SESSION_EXPIRED_CODE } from '../src/lib/auth/session-expired';

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
};

const equipment = [
  { id: 'barbell', name: 'Barbell', category: 'free_weight' },
];

const timezones = ['America/New_York', 'Europe/London', 'Asia/Tokyo'];

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test 1: Action throws SESSION_EXPIRED - no unhandled rejection, caller sees rejection
  {
    const unhandledRejections: unknown[] = [];
    
    // Track unhandled rejections
    const handler = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', handler);

    try {
      let actionCalled = false;

      const actions: SettingsActions = {
        updateSessionSettings: async () => {
          actionCalled = true;
          throw new Error(`${SESSION_EXPIRED_CODE}: Your session has expired`);
        },
        updateProfileSettings: async () => ({ ok: true }),
        updateEquipment: async () => ({ ok: true }),
        updateInjuries: async () => ({ ok: true }),
      };

      const { container } = render(
        <SettingsForm
          initial={initialState}
          equipment={equipment}
          timezones={timezones}
          userId="test-user-123"
          actions={actions}
        />
      );

      // Find and click a toggle to trigger the action
      const toggle = container.querySelector('[role="switch"]');
      if (!toggle) {
        results.push({
          passed: false,
          message: 'Test 1: FAILED - Could not find toggle switch'
        });
      } else {
        await userEvent.click(toggle);

        // Wait for the action to complete and any async effects
        await waitFor(() => new Promise(resolve => setTimeout(resolve, 500)));

        // Check for session expired prompt (shows error was handled)
        const prompt = container.querySelector('[data-testid="session-expired-prompt"]');
        const hasPrompt = prompt !== null;

        // Check action was called
        if (!actionCalled) {
          results.push({
            passed: false,
            message: 'Test 1: FAILED - Action was not called'
          });
        } else if (unhandledRejections.length > 0) {
          results.push({
            passed: false,
            message: `Test 1: FAILED - Unhandled rejection occurred: ${unhandledRejections[0]}`
          });
        } else if (!hasPrompt) {
          results.push({
            passed: false,
            message: 'Test 1: FAILED - Session expired not handled (no prompt shown)'
          });
        } else {
          results.push({
            passed: true,
            message: 'Test 1: PASSED - No unhandled rejection when action throws SESSION_EXPIRED'
          });
        }
      }
    } finally {
      process.removeListener('unhandledRejection', handler);
    }
  }

  // Test 2: Direct queue test - queue catches internal promise rejection
  {
    const unhandledRejections: unknown[] = [];
    const handler = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', handler);

    try {
      // Import save queue
      const { createSaveQueue } = await import('../src/app/settings/save-queue');
      
      type TestResult = { ok: boolean } | { ok: false; error: string };
      const queue = createSaveQueue<TestResult>();

      let callerSawRejection = false;

      // Enqueue a request that throws
      const promise = queue.enqueue('test-key', async () => {
        throw new Error('Test error');
      });

      // The caller should see the rejection
      try {
        await promise;
      } catch (err) {
        callerSawRejection = true;
      }

      // Wait a bit for any unhandled rejections to surface
      await new Promise(resolve => setTimeout(resolve, 100));

      if (!callerSawRejection) {
        results.push({
          passed: false,
          message: 'Test 2: FAILED - Caller did not receive rejection'
        });
      } else if (unhandledRejections.length > 0) {
        results.push({
          passed: false,
          message: `Test 2: FAILED - Unhandled rejection from queue: ${unhandledRejections[0]}`
        });
      } else {
        results.push({
          passed: true,
          message: 'Test 2: PASSED - Queue catches internal promise rejection, caller still sees error'
        });
      }
    } finally {
      process.removeListener('unhandledRejection', handler);
    }
  }

  return results;
}

runTests()
  .then((results) => {
    console.log('\n=== Session Expired No Unhandled Rejection Tests (L2) ===\n');
    
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
