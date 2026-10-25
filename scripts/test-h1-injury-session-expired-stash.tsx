#!/usr/bin/env tsx
/**
 * H1 Regression test: Injury tap crashes during session expiry
 * 
 * This test verifies that tapping an injury chip or severity button while the session
 * is expired stashes the change and shows the session expired prompt, instead of
 * crashing to "Something went wrong".
 * 
 * Expected to FAIL on bd82ecba (no SESSION_EXPIRED handling in injury handlers).
 * Expected to PASS after fix (injury handlers stash on SESSION_EXPIRED like equipment).
 */

import './helpers/setup-jsdom';
import { render, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsForm, type SettingsState, type SettingsActions } from '../src/app/settings/settings-form';
import { SESSION_EXPIRED_CODE } from '../src/lib/auth/session-expired';
import { getPendingChanges, clearPendingChanges } from '../src/lib/auth/pending-changes';
import { resetSessionExpiredState } from '../src/components/session-expired-prompt';

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

async function testH1_InjuryStashOnSessionExpired(): Promise<TestResult> {
  const userId = '00000000-0000-0000-0000-000000000001';
  const actions: SettingsActions = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => ({ ok: true }),
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => {
      // Simulate session expired
      return { ok: false, error: SESSION_EXPIRED_CODE, code: SESSION_EXPIRED_CODE };
    },
  };

  const { getByText, queryByText } = render(
    <SettingsForm
      userId={userId}
      initial={initialState}
      equipment={equipment}
      timezones={timezones}
      actions={actions}
    />
  );

  const user = userEvent.setup();

  // Find and click the "Shoulder" injury chip to add it
  const shoulderChip = getByText('Shoulder');
  await user.click(shoulderChip);

  // Wait for the session expired prompt to appear
  await waitFor(
    () => {
      const prompt = queryByText(/session.*expired/i);
      if (!prompt) {
        throw new Error('Session expired prompt did not appear');
      }
    },
    { timeout: 2000 }
  );

  // Verify the injury change was stashed
  const pending = getPendingChanges(userId);
  
  if (!pending) {
    return {
      passed: false,
      message: 'No pending changes stashed after session expired',
    };
  }

  const injuryChange = pending.changes.find(ch => ch.type === 'injury');
  
  if (!injuryChange) {
    return {
      passed: false,
      message: `Injury change not found in stash. Found types: ${pending.changes.map(c => c.type).join(', ')}`,
    };
  }

  if (!injuryChange.patch || typeof injuryChange.patch !== 'object') {
    return {
      passed: false,
      message: 'Injury change patch is invalid',
    };
  }

  const patch = injuryChange.patch;
  const operation = 'operation' in patch ? patch.operation : undefined;
  const bodyRegion = 'bodyRegion' in patch ? patch.bodyRegion : undefined;
  const present = 'present' in patch ? patch.present : undefined;
  
  if (operation !== 'setInjury' || bodyRegion !== 'shoulder' || present !== true) {
    return {
      passed: false,
      message: `Injury change not correctly stashed. Got: ${JSON.stringify(patch)}`,
    };
  }

  return {
    passed: true,
    message: 'Injury tap correctly stashed on SESSION_EXPIRED and prompted user',
  };
}

async function testH1_InjurySeverityStashOnSessionExpired(): Promise<TestResult> {
  const userId = '00000000-0000-0000-0000-000000000002';
  const initialWithInjury: SettingsState = {
    ...initialState,
    injuries: [{ bodyRegion: 'knee', severity: 'current' }],
  };

  const actions: SettingsActions = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => ({ ok: true }),
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => {
      // Simulate session expired
      return { ok: false, error: SESSION_EXPIRED_CODE, code: SESSION_EXPIRED_CODE };
    },
  };

  const { queryByText, getAllByText } = render(
    <SettingsForm
      userId={userId}
      initial={initialWithInjury}
      equipment={equipment}
      timezones={timezones}
      actions={actions}
    />
  );

  const user = userEvent.setup();

  // Find the knee injury row and click its "Past" severity button
  // There are two "Knee" labels: one in the selection area, one in the severity row
  // We want the one that has "past" buttons nearby
  const allPastButtons = getAllByText('past');
  const allKneeLabels = getAllByText('Knee');
  const kneeLabel = allKneeLabels.find(label => {
    const row = label.closest('div[class*="flex items-center"]');
    return row && within(row as HTMLElement).queryByText('past') !== null;
  });
  if (!kneeLabel) {
    throw new Error('Could not find knee injury row with severity buttons');
  }
  const pastButton = allPastButtons.find(btn => {
    const btnRow = btn.closest('div[class*="flex items-center"]');
    const kneeRow = kneeLabel.closest('div[class*="flex items-center"]');
    return btnRow === kneeRow;
  });
  if (!pastButton) {
    throw new Error('Could not find past button in knee row');
  }
  await user.click(pastButton);

  // Wait for the session expired prompt to appear
  await waitFor(
    () => {
      const prompt = queryByText(/session.*expired/i);
      if (!prompt) {
        throw new Error('Session expired prompt did not appear');
      }
    },
    { timeout: 2000 }
  );

  // Verify the severity change was stashed
  const pending = getPendingChanges(userId);
  
  if (!pending) {
    return {
      passed: false,
      message: 'No pending changes stashed after session expired',
    };
  }

  const injuryChange = pending.changes.find(ch => ch.type === 'injury');
  
  if (!injuryChange) {
    return {
      passed: false,
      message: 'Severity change not found in stash',
    };
  }

  const patch = injuryChange.patch;
  if (typeof patch !== 'object' || !patch) {
    return {
      passed: false,
      message: 'Injury change patch is not an object',
    };
  }
  
  const operation = 'operation' in patch ? patch.operation : undefined;
  const bodyRegion = 'bodyRegion' in patch ? patch.bodyRegion : undefined;
  const severity = 'severity' in patch ? patch.severity : undefined;
  
  if (operation !== 'setInjury' || bodyRegion !== 'knee' || severity !== 'past') {
    return {
      passed: false,
      message: `Severity change not correctly stashed. Got: ${JSON.stringify(patch)}`,
    };
  }

  return {
    passed: true,
    message: 'Injury severity change correctly stashed on SESSION_EXPIRED',
  };
}

async function testH1b_MultiRegionInjuryAccumulation(): Promise<TestResult> {
  const userId = '00000000-0000-0000-0000-000000000003';
  const actions: SettingsActions = {
    updateProfileSettings: async () => ({ ok: true }),
    updateSessionSettings: async () => ({ ok: true }),
    updateEquipment: async () => ({ ok: true }),
    updateInjuries: async () => ({ ok: true }),
    setEquipmentItem: async () => ({ ok: true }),
    setHasAllEquipment: async () => ({ ok: true }),
    setInjury: async () => {
      // Simulate session expired
      return { ok: false, error: SESSION_EXPIRED_CODE, code: SESSION_EXPIRED_CODE };
    },
  };

  const { getAllByRole, queryByText } = render(
    <SettingsForm
      userId={userId}
      initial={initialState}
      equipment={equipment}
      timezones={timezones}
      actions={actions}
    />
  );

  const user = userEvent.setup();
  
  // Tap Knee first (find the unpressed chip button in the selection area)
  const allKneeButtons = getAllByRole('button', { name: /knee/i });
  const kneeChip = allKneeButtons.find(btn => btn.getAttribute('aria-pressed') === 'false');
  if (!kneeChip) {
    return {
      passed: false,
      message: 'No unpressed Knee chip button found',
    };
  }
  
  // Tap Lower back second
  const allLowerBackButtons = getAllByRole('button', { name: /lower back/i });
  const lowerBackChip = allLowerBackButtons.find(btn => btn.getAttribute('aria-pressed') === 'false');
  if (!lowerBackChip) {
    return {
      passed: false,
      message: 'No unpressed Lower back chip button found',
    };
  }
  
  // Tap both quickly
  await user.click(kneeChip);
  await user.click(lowerBackChip);
  
  // Wait for session expired prompt and stashing to complete
  await waitFor(() => {
    if (!queryByText(/session.*expired/i)) {
      throw new Error('Waiting for session expired prompt');
    }
  }, { timeout: 2000 });
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Check that both regions are stashed
  const pending = getPendingChanges(userId);
  
  if (!pending) {
    // Debug: check sessionStorage directly
    const raw = typeof window !== 'undefined' ? window.sessionStorage.getItem('abhyas_pending_settings') : null;
    return {
      passed: false,
      message: `No pending changes stashed. SessionStorage raw: ${raw ? 'exists' : 'null'}`,
    };
  }
  
  const injuryChanges = pending.changes.filter(ch => ch.type === 'injury');
  
  if (injuryChanges.length < 2) {
    return {
      passed: false,
      message: `Expected 2 injury changes (knee + lower_back), got ${injuryChanges.length}. Changes: ${JSON.stringify(injuryChanges)}`,
    };
  }
  
  const kneeChange = injuryChanges.find(ch => {
    const p = ch.patch;
    return p && typeof p === 'object' && 'bodyRegion' in p && p.bodyRegion === 'knee';
  });
  
  const lowerBackChange = injuryChanges.find(ch => {
    const p = ch.patch;
    return p && typeof p === 'object' && 'bodyRegion' in p && p.bodyRegion === 'lower_back';
  });
  
  if (!kneeChange) {
    return {
      passed: false,
      message: 'Knee change not found in stash (overwritten by lower_back)',
    };
  }
  
  if (!lowerBackChange) {
    return {
      passed: false,
      message: 'Lower back change not found in stash',
    };
  }
  
  return {
    passed: true,
    message: 'Both knee and lower_back injury changes accumulated in stash (H1b fix)',
  };
}

(async () => {
  console.log('\n🧪 H1 Regression: Injury tap crashes during session expiry\n');

  try {
    cleanup();
    clearPendingChanges();
    resetSessionExpiredState();
    const result1 = await testH1_InjuryStashOnSessionExpired();
    console.log(result1.passed ? `  ✓ ${result1.message}` : `  ❌ ${result1.message}`);
    cleanup();
    clearPendingChanges();
    resetSessionExpiredState();

    cleanup();
    clearPendingChanges();
    resetSessionExpiredState();
    const result2 = await testH1_InjurySeverityStashOnSessionExpired();
    console.log(result2.passed ? `  ✓ ${result2.message}` : `  ❌ ${result2.message}`);
    cleanup();
    clearPendingChanges();
    resetSessionExpiredState();

    cleanup();
    clearPendingChanges();
    resetSessionExpiredState();
    const result3 = await testH1b_MultiRegionInjuryAccumulation();
    console.log(result3.passed ? `  ✓ ${result3.message}` : `  ❌ ${result3.message}`);

    if (result1.passed && result2.passed && result3.passed) {
      console.log('\n✅ All H1 tests passed!\n');
      process.exit(0);
    } else {
      console.log('\n❌ Some H1 tests failed\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test error:', error);
    process.exit(1);
  }
})();
