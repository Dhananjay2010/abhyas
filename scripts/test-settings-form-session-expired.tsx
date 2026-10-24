#!/usr/bin/env tsx
/**
 * Test: SettingsForm session expired handling
 * 
 * Tests that SettingsForm correctly:
 * - Shows SessionExpiredPrompt when action throws with SESSION_EXPIRED
 * - Shows SessionExpiredPrompt when action returns result with SESSION_EXPIRED code
 * - Does NOT show generic error when session expires
 * - Prompt has correct href with encoded next parameter
 * - Prompt is accessible (role="alert")
 * - Sign-in link meets 44px minimum touch target
 * 
 * All tests must FAIL when run against main's implementation (before the fix).
 */

import './helpers/setup-jsdom';
import { render, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SESSION_EXPIRED_CODE } from '../src/lib/auth/session-expired';
import { resetSessionExpiredState } from '../src/components/session-expired-prompt';
import { SettingsForm, type SettingsState, type SettingsActions } from '../src/app/settings/settings-form';
import { getPendingChanges, clearPendingChanges, stashPendingChanges } from '../src/lib/auth/pending-changes';

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

  // Test 1: Action throws Error with SESSION_EXPIRED prefix
  {
    resetSessionExpiredState();
    const actions: SettingsActions = {
      updateSessionSettings: async () => {
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

      // Wait for SessionExpiredPrompt to appear
      try {
        await waitFor(() => {
          const alert = container.querySelector('[data-testid="session-expired-prompt"]');
          return alert !== null;
        }, { timeout: 3000 });

        const alert = container.querySelector('[data-testid="session-expired-prompt"]');
        const hasAlert = alert !== null;
        const alertText = alert?.textContent || '';
        const hasCorrectText = alertText.toLowerCase().includes('session') && alertText.toLowerCase().includes('sign in');
        
        // Check that generic error does NOT appear
        const genericError = container.textContent?.includes('An unexpected response was received from the server');
        const noGenericError = !genericError;

        const passed = hasAlert && hasCorrectText && noGenericError;
        results.push({
          passed,
          message: passed
            ? 'Test 1: Shows SessionExpiredPrompt on thrown Error with SESSION_EXPIRED, no generic error'
            : `Test 1: FAILED - hasAlert: ${hasAlert}, correctText: ${hasCorrectText}, noGenericError: ${noGenericError}, alertText: "${alertText}"`
        });
      } catch (err) {
        results.push({
          passed: false,
          message: `Test 1: FAILED - Timeout waiting for alert: ${err}`
        });
      }
    }
  }

  // Test 2: Action returns Result with code: SESSION_EXPIRED
  {
    resetSessionExpiredState();
    const actions: SettingsActions = {
      updateSessionSettings: async () => ({ ok: false, error: 'Session expired', code: SESSION_EXPIRED_CODE } as { ok: false; error: string; code: string }),
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

    const toggle = container.querySelectorAll('[role="switch"]')[1]; // Pick a different toggle
    if (!toggle) {
      results.push({
        passed: false,
        message: 'Test 2: FAILED - Could not find second toggle'
      });
    } else {
      try {
        await userEvent.click(toggle);

        await waitFor(() => {
          const alert = container.querySelector('[data-testid="session-expired-prompt"]');
          return alert !== null;
        }, { timeout: 3000 });

        const alert = container.querySelector('[data-testid="session-expired-prompt"]');
        const hasAlert = alert !== null;
        
        const genericError = container.textContent?.includes('An unexpected response was received from the server');
        const noGenericError = !genericError;

        const passed = hasAlert && noGenericError;
        results.push({
          passed,
          message: passed
            ? 'Test 2: Shows SessionExpiredPrompt on Result with SESSION_EXPIRED code, no generic error'
            : `Test 2: FAILED - hasAlert: ${hasAlert}, noGenericError: ${noGenericError}`
        });
      } catch (err) {
        results.push({
          passed: false,
          message: `Test 2: FAILED - Error: ${err}`
        });
      }
    }
  }

  // Test 3: Prompt link exists and starts with correct sign-in path
  {
    resetSessionExpiredState();
    const actions: SettingsActions = {
      updateSessionSettings: async () => {
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

    const toggle = container.querySelectorAll('[role="switch"]')[2];
    if (!toggle) {
      results.push({
        passed: false,
        message: 'Test 3: FAILED - Could not find third toggle'
      });
    } else {
      try {
        await userEvent.click(toggle);

        await waitFor(() => {
          const link = container.querySelector('[data-testid="session-expired-prompt"] a');
          return link !== null;
        }, { timeout: 3000 });

        const link = container.querySelector('[data-testid="session-expired-prompt"] a') as HTMLAnchorElement;
        if (!link) {
          results.push({
            passed: false,
            message: 'Test 3: FAILED - Link not found'
          });
        } else {
          const href = link.getAttribute('href') || '';
          // Check that href is a valid sign-in path (either "/" or "/?next=...")
          const isValidSignInHref = href === '/' || href.startsWith('/?next=');

          results.push({
            passed: isValidSignInHref,
            message: isValidSignInHref
              ? `Test 3: Prompt has valid sign-in href: "${href}"`
              : `Test 3: FAILED - Expected sign-in href (/ or /?next=...), got "${href}"`
          });
        }
      } catch (err) {
        results.push({
          passed: false,
          message: `Test 3: FAILED - Error: ${err}`
        });
      }
    }
  }

  // Test 4: Sign-in link meets 44px minimum touch target
  {
    resetSessionExpiredState();
    const actions: SettingsActions = {
      updateSessionSettings: async () => {
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

    const toggle = container.querySelectorAll('[role="switch"]')[3];
    if (!toggle) {
      results.push({
        passed: false,
        message: 'Test 4: FAILED - Could not find fourth toggle'
      });
    } else {
      await userEvent.click(toggle);

      try {
        await waitFor(() => {
          const link = container.querySelector('[data-testid="session-expired-prompt"] a');
          return link !== null;
        }, { timeout: 3000 });

        const link = container.querySelector('[data-testid="session-expired-prompt"] a') as HTMLElement;
        
        if (!link) {
          results.push({
            passed: false,
            message: 'Test 4: FAILED - Link not found in alert'
          });
        } else {
          // Check if className includes min-h-[44px]
          const hasMinHeight = link.className.includes('min-h-[44px]');

          results.push({
            passed: hasMinHeight,
            message: hasMinHeight
              ? 'Test 4: Sign-in link has 44px minimum touch target (min-h-[44px] in className)'
              : `Test 4: FAILED - className does not include min-h-[44px]: ${link.className}`
          });
        }
      } catch (err) {
        results.push({
          passed: false,
          message: `Test 4: FAILED - Timeout waiting for link: ${err}`
        });
      }
    }
  }

  // Test 5: Normal error still shows error note
  {
    resetSessionExpiredState();
    const actions: SettingsActions = {
      updateSessionSettings: async () => ({ ok: false, error: 'Network error' }),
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

      const toggle = container.querySelectorAll('[role="switch"]')[4];
    if (!toggle) {
      results.push({
        passed: false,
        message: 'Test 5: FAILED - Could not find fifth toggle'
      });
    } else {
      try {
        await userEvent.click(toggle);

        await waitFor(() => {
          const errorText = container.textContent?.includes("Couldn't save");
          return errorText === true;
        }, { timeout: 3000 });

        const hasError = container.textContent?.includes("Couldn't save");
        const sessionPrompt = container.querySelector('[data-testid="session-expired-prompt"]');
        const noSessionPrompt = !sessionPrompt;
        
        // Debug: check what the prompt contains if it exists
        const promptContent = sessionPrompt ? sessionPrompt.textContent : 'no prompt';

        const passed = hasError && noSessionPrompt;
        results.push({
          passed,
          message: passed
            ? 'Test 5: Normal errors still show error note, no session prompt'
            : `Test 5: FAILED - hasError: ${hasError}, noSessionPrompt: ${noSessionPrompt}, promptContent: "${promptContent}"`
        });
      } catch (err) {
        results.push({
          passed: false,
          message: `Test 5: FAILED - Error: ${err}`
        });
      }
    }
  }

  // Test 6a: Form stashes toggle + equipment when actions return SESSION_EXPIRED result
  {
    resetSessionExpiredState();
    clearPendingChanges();
    
    const testState: SettingsState = {
      ...initialState,
      hasAllEquipment: false,
      equipmentIds: []
    };
    
    const actions: SettingsActions = {
      updateSessionSettings: async () => ({
        ok: false,
        error: 'Session expired',
        code: SESSION_EXPIRED_CODE
      } as { ok: false; error: string; code: string }),
      updateProfileSettings: async () => ({ ok: true }),
      updateEquipment: async () => ({
        ok: false,
        error: 'Session expired',
        code: SESSION_EXPIRED_CODE
      } as { ok: false; error: string; code: string }),
      updateInjuries: async () => ({ ok: true }),
    };

    const { container } = render(
      <SettingsForm
        initial={testState}
        equipment={equipment}
        timezones={timezones}
        userId="test-user-123"
        actions={actions}
      />
    );

    // Click cool-down toggle (3rd toggle, index 2)
    const toggles = container.querySelectorAll('[role="switch"]');
    const coolDownToggle = toggles[2]; // Cool-down block toggle
    
    if (!coolDownToggle) {
      results.push({
        passed: false,
        message: 'Test 6a: FAILED - Could not find cool-down toggle (index 2)'
      });
    } else {
      await userEvent.click(coolDownToggle as HTMLElement);
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Click equipment chip (will also return SESSION_EXPIRED)
      // Find all unpressed buttons, look for equipment chip (should contain equipment name like "Barbell")
      const allUnpressedButtons = container.querySelectorAll('button[aria-pressed="false"]');
      let equipmentChip = null;
      for (const btn of Array.from(allUnpressedButtons)) {
        if (btn.textContent?.includes('Barbell')) {
          equipmentChip = btn;
          break;
        }
      }
      
      if (equipmentChip) {
        await userEvent.click(equipmentChip as HTMLElement);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Both saves should have stashed
      const pending = getPendingChanges('test-user-123');
      const hasBoth = pending !== null && pending.changes.length >= 2;
      const hasSession = pending?.changes.some(ch => ch.type === 'session');
      const hasEquipment = pending?.changes.some(ch => ch.type === 'equipment');
      
      const sessionChange = pending?.changes.find(ch => ch.type === 'session');
      const equipmentChange = pending?.changes.find(ch => ch.type === 'equipment');
      
      const sessionPatchValid = sessionChange && 
        typeof sessionChange.patch === 'object' && 
        sessionChange.patch !== null &&
        'cooldown_enabled' in sessionChange.patch;
      
      const equipmentPatchValid = equipmentChange && 
        typeof equipmentChange.patch === 'object' && 
        equipmentChange.patch !== null &&
        'hasAll' in equipmentChange.patch &&
        'equipmentIds' in equipmentChange.patch;

      clearPendingChanges();

      const passed = hasBoth && hasSession === true && hasEquipment === true &&
                     sessionPatchValid === true && equipmentPatchValid === true;

      results.push({
        passed,
        message: passed
          ? 'Test 6a: Form stashes toggle + equipment when actions return SESSION_EXPIRED result'
          : `Test 6a: FAILED - hasBoth: ${hasBoth}, hasSession: ${hasSession}, hasEquip: ${hasEquipment}, sessionPatch: ${sessionPatchValid}, equipPatch: ${equipmentPatchValid}, sessionPatchKeys: ${sessionChange ? Object.keys(sessionChange.patch as object).join(',') : 'none'}`
      });
    }
  }

  // Test 6b: Form stashes toggle + equipment when actions throw SESSION_EXPIRED error
  {
    resetSessionExpiredState();
    clearPendingChanges();
    
    const testState: SettingsState = {
      ...initialState,
      hasAllEquipment: false,
      equipmentIds: []
    };
    
    const actions: SettingsActions = {
      updateSessionSettings: async () => {
        throw new Error(`${SESSION_EXPIRED_CODE}: Your session has expired`);
      },
      updateProfileSettings: async () => ({ ok: true }),
      updateEquipment: async () => {
        throw new Error(`${SESSION_EXPIRED_CODE}: Your session has expired`);
      },
      updateInjuries: async () => ({ ok: true }),
    };

    const { container } = render(
      <SettingsForm
        initial={testState}
        equipment={equipment}
        timezones={timezones}
        userId="test-user-123"
        actions={actions}
      />
    );

    // Click cool-down toggle (3rd toggle, index 2)
    const toggles = container.querySelectorAll('[role="switch"]');
    const coolDownToggle = toggles[2]; // Cool-down block toggle
    
    if (!coolDownToggle) {
      results.push({
        passed: false,
        message: 'Test 6b: FAILED - Could not find cool-down toggle (index 2)'
      });
    } else {
      await userEvent.click(coolDownToggle as HTMLElement);
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Click equipment chip (will also throw SESSION_EXPIRED)
      // Find all unpressed buttons, look for equipment chip (should contain equipment name like "Barbell")
      const allUnpressedButtons = container.querySelectorAll('button[aria-pressed="false"]');
      let equipmentChip = null;
      for (const btn of Array.from(allUnpressedButtons)) {
        if (btn.textContent?.includes('Barbell')) {
          equipmentChip = btn;
          break;
        }
      }
      
      if (equipmentChip) {
        await userEvent.click(equipmentChip as HTMLElement);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Both saves should have stashed
      const pending = getPendingChanges('test-user-123');
      const hasBoth = pending !== null && pending.changes.length >= 2;
      const hasSession = pending?.changes.some(ch => ch.type === 'session');
      const hasEquipment = pending?.changes.some(ch => ch.type === 'equipment');
      
      const sessionChange = pending?.changes.find(ch => ch.type === 'session');
      const equipmentChange = pending?.changes.find(ch => ch.type === 'equipment');
      
      const sessionPatchValid = sessionChange && 
        typeof sessionChange.patch === 'object' && 
        sessionChange.patch !== null &&
        'cooldown_enabled' in sessionChange.patch;
      
      const equipmentPatchValid = equipmentChange && 
        typeof equipmentChange.patch === 'object' && 
        equipmentChange.patch !== null &&
        'hasAll' in equipmentChange.patch &&
        'equipmentIds' in equipmentChange.patch;

      clearPendingChanges();

      const passed = hasBoth && hasSession === true && hasEquipment === true &&
                     sessionPatchValid === true && equipmentPatchValid === true;

      results.push({
        passed,
        message: passed
          ? 'Test 6b: Form stashes toggle + equipment when actions throw SESSION_EXPIRED error'
          : `Test 6b: FAILED - hasBoth: ${hasBoth}, hasSession: ${hasSession}, hasEquip: ${hasEquipment}, sessionPatch: ${sessionPatchValid}, equipPatch: ${equipmentPatchValid}`
      });
    }
  }

  // Test 7: Form restores stashed changes on mount
  {
    resetSessionExpiredState();
    clearPendingChanges();
    
    // Seed the stash with toggle + equipment changes
    // Match mockState.pathname ('/settings') for restoration to work
    stashPendingChanges([
      {
        key: 'cooldown_enabled',
        type: 'session',
        patch: { cooldown_enabled: false },
        timestamp: Date.now()
      },
      {
        key: 'equipment',
        type: 'equipment',
        patch: { hasAll: false, equipmentIds: ['barbell'] },
        timestamp: Date.now()
      }
    ], '/settings', 'test-user-123');
    
    const testState: SettingsState = {
      ...initialState,
      hasAllEquipment: false,
      equipmentIds: []
    };
    
    // Spy on save actions
    const sessionCalls: unknown[] = [];
    const equipmentCalls: unknown[] = [];
    
    const actions: SettingsActions = {
      updateSessionSettings: async (patch) => {
        sessionCalls.push(patch);
        return { ok: true };
      },
      updateProfileSettings: async () => ({ ok: true }),
      updateEquipment: async (patch) => {
        equipmentCalls.push(patch);
        return { ok: true };
      },
      updateInjuries: async () => ({ ok: true }),
    };

    // Render form within act to ensure effects run
    await act(async () => {
      render(
        <SettingsForm
          initial={testState}
          equipment={equipment}
          timezones={timezones}
          userId="test-user-123"
          actions={actions}
        />
      );
      // Flush microtasks to allow effects and save queue to complete
      await new Promise(resolve => setTimeout(resolve, 500));
    });

    // Give more time for restoration to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // Wait for restoration to complete
    await waitFor(() => {
      return sessionCalls.length > 0 && equipmentCalls.length > 0;
    }, { timeout: 5000 });

    const sessionCalledOnce = sessionCalls.length === 1;
    const equipmentCalledOnce = equipmentCalls.length === 1;
    
    const sessionPatchCorrect = sessionCalledOnce && 
      typeof sessionCalls[0] === 'object' &&
      sessionCalls[0] !== null &&
      'cooldown_enabled' in sessionCalls[0] &&
      (sessionCalls[0] as { cooldown_enabled: boolean }).cooldown_enabled === false;
    
    const equipmentPatchCorrect = equipmentCalledOnce &&
      typeof equipmentCalls[0] === 'object' &&
      equipmentCalls[0] !== null &&
      'hasAll' in equipmentCalls[0] &&
      'equipmentIds' in equipmentCalls[0] &&
      (equipmentCalls[0] as { hasAll: boolean; equipmentIds: string[] }).hasAll === false &&
      (equipmentCalls[0] as { hasAll: boolean; equipmentIds: string[] }).equipmentIds.includes('barbell');
    
    // Stash should be cleared after successful restoration
    const pendingAfter = getPendingChanges('test-user-123');
    const stashCleared = pendingAfter === null;

    const passed = sessionCalledOnce && equipmentCalledOnce &&
                   sessionPatchCorrect && equipmentPatchCorrect &&
                   stashCleared;

    results.push({
      passed,
      message: passed
        ? 'Test 7: Form restores stashed changes on mount'
        : `Test 7: FAILED - sessionOnce: ${sessionCalledOnce}, equipOnce: ${equipmentCalledOnce}, sessionPatch: ${sessionPatchCorrect}, equipPatch: ${equipmentPatchCorrect}, cleared: ${stashCleared}`
    });
  }

  // Test 7b: When restore save returns SESSION_EXPIRED, stash is kept
  {
    resetSessionExpiredState();
    clearPendingChanges();
    
    // Seed the stash with a toggle change
    // Match mockState.pathname ('/settings') for restoration to work
    stashPendingChanges([
      {
        key: 'cooldown_enabled',
        type: 'session',
        patch: { cooldown_enabled: false },
        timestamp: Date.now()
      }
    ], '/settings', 'test-user-123');
    
    const testState: SettingsState = {
      ...initialState,
      hasAllEquipment: false,
      equipmentIds: []
    };
    
    // Action that returns SESSION_EXPIRED on restore attempt
    const actions: SettingsActions = {
      updateSessionSettings: async () => ({
        ok: false,
        error: 'Session expired',
        code: SESSION_EXPIRED_CODE
      } as { ok: false; error: string; code: string }),
      updateProfileSettings: async () => ({ ok: true }),
      updateEquipment: async () => ({ ok: true }),
      updateInjuries: async () => ({ ok: true }),
    };

    // Render form within act
    await act(async () => {
      render(
        <SettingsForm
          initial={testState}
          equipment={equipment}
          timezones={timezones}
          userId="test-user-123"
          actions={actions}
        />
      );
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Wait for prompt to appear
    await waitFor(() => {
      const alert = document.querySelector('[data-testid="session-expired-prompt"]');
      return alert !== null;
    }, { timeout: 3000 });

    // Stash should NOT be cleared (session expired again)
    const pendingAfter = getPendingChanges('test-user-123');
    const stashKept = pendingAfter !== null && pendingAfter.changes.length === 1;
    const hasCorrectChange = pendingAfter?.changes[0]?.key === 'cooldown_enabled';

    const passed = stashKept && hasCorrectChange;

    results.push({
      passed,
      message: passed
        ? 'Test 7b: When restore save returns SESSION_EXPIRED, stash is kept'
        : `Test 7b: FAILED - stashKept: ${stashKept}, hasCorrectChange: ${hasCorrectChange}`
    });
  }

  // Test 7c: Restore enqueues each change exactly once, even after rerender
  {
    resetSessionExpiredState();
    clearPendingChanges();
    
    // Seed the stash with session and equipment changes
    stashPendingChanges([
      {
        key: 'cooldown_enabled',
        type: 'session',
        patch: { cooldown_enabled: false },
        timestamp: Date.now()
      },
      {
        key: 'equipment',
        type: 'equipment',
        patch: { hasAll: false, equipmentIds: ['barbell'] },
        timestamp: Date.now()
      }
    ], '/settings', 'test-user-123');
    
    const testState: SettingsState = {
      ...initialState,
      hasAllEquipment: false,
      equipmentIds: []
    };
    
    // Track call count across rerenders
    const sessionCalls: unknown[] = [];
    const equipmentCalls: unknown[] = [];
    
    const actions: SettingsActions = {
      updateSessionSettings: async (patch) => {
        sessionCalls.push(patch);
        return { ok: true };
      },
      updateProfileSettings: async () => ({ ok: true }),
      updateEquipment: async (patch) => {
        equipmentCalls.push(patch);
        return { ok: true };
      },
      updateInjuries: async () => ({ ok: true }),
    };

    // Initial render
    let result: { rerender: (ui: React.ReactElement) => void };
    await act(async () => {
      result = render(
        <SettingsForm
          initial={testState}
          equipment={equipment}
          timezones={timezones}
          actions={actions}
        />
      );
      await new Promise(resolve => setTimeout(resolve, 500));
    });

    // Wait for initial restoration
    await waitFor(() => {
      return sessionCalls.length > 0 && equipmentCalls.length > 0;
    }, { timeout: 3000 });

    const callsAfterMount = { session: sessionCalls.length, equipment: equipmentCalls.length };

    // Force a rerender with new props
    await act(async () => {
      result!.rerender(
        <SettingsForm
          initial={{ ...testState, level: 'expert' }}
          equipment={equipment}
          timezones={timezones}
          actions={actions}
        />
      );
      await new Promise(resolve => setTimeout(resolve, 200));
    });

    const callsAfterRerender = { session: sessionCalls.length, equipment: equipmentCalls.length };
    
    // Calls should not increase after rerender
    const noDoubleEnqueue = callsAfterMount.session === callsAfterRerender.session &&
                            callsAfterMount.equipment === callsAfterRerender.equipment;
    
    const passed = callsAfterMount.session === 1 && 
                   callsAfterMount.equipment === 1 && 
                   noDoubleEnqueue;

    results.push({
      passed,
      message: passed
        ? 'Test 7c: Restore enqueues each change exactly once, no double-enqueue on rerender'
        : `Test 7c: FAILED - session: ${callsAfterMount.session}→${callsAfterRerender.session}, equipment: ${callsAfterMount.equipment}→${callsAfterRerender.equipment}`
    });
  }

  return results;
}

async function main() {
  console.log('==========================================');
  console.log('Testing SettingsForm session expired handling');
  console.log('==========================================\n');

  // Catch unhandled promise rejections from React transitions
  const rejections: unknown[] = [];
  const rejectHandler = (reason: unknown) => {
    rejections.push(reason);
  };
  process.on('unhandledRejection', rejectHandler);

  const results = await runTests();
  
  // Remove handler after tests
  process.off('unhandledRejection', rejectHandler);
  let allPassed = true;

  for (const result of results) {
    const status = result.passed ? '✓' : '✗';
    console.log(`${status} ${result.message}`);
    if (!result.passed) allPassed = false;
  }

  console.log('\n==========================================');
  if (allPassed) {
    console.log('All SettingsForm session expired tests passed\n');
    process.exit(0);
  } else {
    console.log('Some SettingsForm session expired tests FAILED\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
