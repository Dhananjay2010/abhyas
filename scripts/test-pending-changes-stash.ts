#!/usr/bin/env tsx
/**
 * Test: pending changes stash and re-apply
 * Must fail on main: module src/lib/auth/pending-changes.ts doesn't exist
 */

// Mock sessionStorage and window
const mockSessionStorage = {
  _data: {} as Record<string, string>,
  getItem(key: string): string | null {
    return this._data[key] ?? null;
  },
  setItem(key: string, value: string): void {
    this._data[key] = value;
  },
  removeItem(key: string): void {
    delete this._data[key];
  },
  clear(): void {
    this._data = {};
  },
  get length(): number {
    return Object.keys(this._data).length;
  },
  key(index: number): string | null {
    return Object.keys(this._data)[index] ?? null;
  }
};

(global as unknown as { window: { sessionStorage: typeof mockSessionStorage } }).window = {
  sessionStorage: mockSessionStorage
};

import { stashPendingChanges, getPendingChanges, clearPendingChanges, type PendingChange } from '../src/lib/auth/pending-changes';

console.log('Testing pending changes stash and re-apply');
console.log('==========================================\n');

let allPassed = true;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${(err as Error).message}`);
    allPassed = false;
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

// Clear before each test
beforeEach();
function beforeEach() {
  clearPendingChanges();
  mockSessionStorage.clear();
}

test('stashPendingChanges stores change in sessionStorage', () => {
  beforeEach();
  const changes: PendingChange[] = [
    { key: 'preferred_session_minutes', type: 'profile', patch: { preferred_session_minutes: 60 }, timestamp: Date.now() }
  ];
  const result = stashPendingChanges(changes, '/settings');
  assert(result === true, 'stashPendingChanges should return true');
  
  const stored = getPendingChanges();
  assert(stored !== null, 'getPendingChanges should return stored data');
  assert(stored!.returnPath === '/settings', 'returnPath should match');
  assert(stored!.changes.length === 1, 'should have 1 change');
  assert(stored!.changes[0].key === 'preferred_session_minutes', 'key should match');
  assert(stored!.changes[0].type === 'profile', 'type should match');
});

test('getPendingChanges returns null when nothing stashed', () => {
  beforeEach();
  const result = getPendingChanges();
  assert(result === null, 'should return null when nothing stashed');
});

test('getPendingChanges filters expired changes (> 10 min)', () => {
  beforeEach();
  const now = Date.now();
  const elevenMinutesAgo = now - (11 * 60 * 1000);
  const changes: PendingChange[] = [
    { key: 'preferred_session_minutes', type: 'profile', patch: { preferred_session_minutes: 60 }, timestamp: elevenMinutesAgo }
  ];
  stashPendingChanges(changes, '/settings');
  
  const stored = getPendingChanges();
  assert(stored === null, 'expired changes should be filtered out');
});

test('getPendingChanges keeps recent changes (< 10 min)', () => {
  beforeEach();
  const now = Date.now();
  const fiveMinutesAgo = now - (5 * 60 * 1000);
  const changes: PendingChange[] = [
    { key: 'preferred_session_minutes', type: 'profile', patch: { preferred_session_minutes: 60 }, timestamp: fiveMinutesAgo }
  ];
  stashPendingChanges(changes, '/settings');
  
  const stored = getPendingChanges();
  assert(stored !== null, 'recent changes should be kept');
  assert(stored!.changes.length === 1, 'should have 1 change');
});

test('clearPendingChanges removes stashed data', () => {
  beforeEach();
  const changes: PendingChange[] = [
    { key: 'preferred_session_minutes', type: 'profile', patch: { preferred_session_minutes: 60 }, timestamp: Date.now() }
  ];
  stashPendingChanges(changes, '/settings');
  
  clearPendingChanges();
  
  const stored = getPendingChanges();
  assert(stored === null, 'should return null after clearing');
});

test('Multiple changes can be stashed', () => {
  beforeEach();
  const changes: PendingChange[] = [
    { key: 'preferred_session_minutes', type: 'profile', patch: { preferred_session_minutes: 60 }, timestamp: Date.now() },
    { key: 'timezone', type: 'profile', patch: { timezone: 'Asia/Kolkata' }, timestamp: Date.now() },
    { key: 'equipment', type: 'equipment', patch: { hasAll: false, equipmentIds: ['barbell'] }, timestamp: Date.now() }
  ];
  stashPendingChanges(changes, '/settings');
  
  const stored = getPendingChanges();
  assert(stored !== null, 'should return stored data');
  assert(stored!.changes.length === 3, 'should have 3 changes');
});

console.log('\n==========================================');
if (allPassed) {
  console.log('All pending changes tests passed\n');
  process.exit(0);
} else {
  console.log('Some tests failed\n');
  process.exit(1);
}
