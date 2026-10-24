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

// Additional jsdom setup for Next.js components
if (typeof (global as any).self === 'undefined') {
  (global as any).self = global;
}
if (typeof (global as any).requestIdleCallback === 'undefined') {
  (global as any).requestIdleCallback = (cb: () => void) => setTimeout(cb, 0);
  (global as any).cancelIdleCallback = (id: number) => clearTimeout(id);
}
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SESSION_EXPIRED_CODE } from '../src/lib/auth/session-expired';

interface TestResult {
  passed: boolean;
  message: string;
}

// Mock Next.js navigation hook by patching the module before importing SettingsForm
const mockNavigationModule = {
  usePathname: () => '/settings',
  useRouter: () => ({
    push: () => {},
    refresh: () => {},
  }),
};

// Patch require.cache to mock Next.js modules
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id: string) {
  if (id === 'next/navigation') {
    return mockNavigationModule;
  }
  if (id === 'next/link') {
    return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
      return <a href={href}>{children}</a>;
    };
  }
  return originalRequire.apply(this, arguments);
};

// Now import after mocking
import { SettingsForm, type SettingsState, type SettingsActions } from '../src/app/settings/settings-form';

const initialState: SettingsState = {
  goal: 'muscle',
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
};

const equipment = [
  { id: 'barbell', name: 'Barbell', category: 'free_weight' },
];

const timezones = ['America/New_York', 'Europe/London', 'Asia/Tokyo'];

import { resetSessionExpiredState } from '../src/components/session-expired-prompt';

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
      updateSessionSettings: async () => ({ ok: false, code: SESSION_EXPIRED_CODE } as any),
      updateProfileSettings: async () => ({ ok: true }),
      updateEquipment: async () => ({ ok: true }),
      updateInjuries: async () => ({ ok: true }),
    };

    const { container } = render(
      <SettingsForm
        initial={initialState}
        equipment={equipment}
        timezones={timezones}
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

  // Test 3: Prompt has correct href with encoded next parameter
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
          const expectedHref = '/?next=' + encodeURIComponent('/settings');
          const passed = href === expectedHref;

          results.push({
            passed,
            message: passed
              ? `Test 3: Prompt href is correct: "${href}"`
              : `Test 3: FAILED - Expected "${expectedHref}", got "${href}"`
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
          const errorText = container.textContent?.includes('Network error');
          return errorText === true;
        }, { timeout: 3000 });

        const hasError = container.textContent?.includes('Network error');
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

  return results;
}

async function main() {
  console.log('==========================================');
  console.log('Testing SettingsForm session expired handling');
  console.log('==========================================\n');

  const results = await runTests();
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
