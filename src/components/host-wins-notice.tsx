"use client";

import { useState, useEffect } from "react";

type HostWinsNoticeProps = {
  userGymName: string | null;
  hostGymName: string | null;
};

/**
 * Host-wins notice: shown when a signed-in member's gym differs from the host's gym.
 * Small, dismissible, non-blocking notice with role=status.
 */
export function HostWinsNotice({ userGymName, hostGymName }: HostWinsNoticeProps) {
  const [dismissed, setDismissed] = useState(false);

  // Show if:
  // 1. User has a gym (signed in member)
  // 2. Host has a gym (on a gym's domain)
  // 3. They're different
  // 4. Not dismissed
  const shouldShow =
    !dismissed &&
    userGymName &&
    hostGymName &&
    userGymName !== hostGymName;

  if (!shouldShow) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md px-4 py-2 rounded-lg shadow-lg flex items-center gap-3"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
        borderWidth: '1px',
        color: 'var(--color-fg)',
      }}
    >
      <p className="text-sm flex-1">
        You&apos;re signed in to <strong>{userGymName}</strong>; this site is{' '}
        <strong>{hostGymName}</strong>.
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="text-muted hover:text-fg transition-colors text-sm px-2 py-1"
        aria-label="Dismiss notice"
      >
        ✕
      </button>
    </div>
  );
}
